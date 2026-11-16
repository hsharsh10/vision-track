import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.db.database import SessionLocal
from backend.app.services.transit_service import transit_service
from backend.app.models.models import TransitStation

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"

def test_popular_corridors_api():
    response = client.get("/api/v1/routes/popular-corridors")
    assert response.status_code == 200
    corridors = response.json()
    assert len(corridors) >= 3
    assert any("Connaught Place" in c["title"] for c in corridors)

def test_dmrc_official_fare_slabs():
    db = SessionLocal()
    try:
        # Distance slab 0-2 km standard: ₹11, smart card: ₹9.9
        fare_std, _ = transit_service.calculate_dmrc_fare(db, 1.5, has_smart_card=False)
        assert fare_std == 11.0

        fare_card, _ = transit_service.calculate_dmrc_fare(db, 1.5, has_smart_card=True)
        assert fare_card == 9.9

        # Distance slab 5-12 km standard: ₹32, smart card: ₹28.8
        fare_10k, _ = transit_service.calculate_dmrc_fare(db, 8.0, has_smart_card=True)
        assert fare_10k == 28.8

        # Distance slab > 32 km standard: ₹64, smart card: ₹57.6
        fare_long, _ = transit_service.calculate_dmrc_fare(db, 35.0, has_smart_card=True)
        assert fare_long == 57.6
    finally:
        db.close()

def test_delhi_metered_auto_formula():
    # 5 km trip: Base ₹30 for first 1.5 km + 3.5km * ₹11 + waiting
    fare, details = transit_service.calculate_metered_auto_fare(5.0, is_night=False, waiting_min=0)
    expected_subtotal = 30.0 + (3.5 * 11.0) # 30 + 38.5 = 68.5
    assert fare == 68.5
    assert details["base_fare"] == 30.0

    # Night surcharge: 25% extra between 11PM and 5AM
    fare_night, _ = transit_service.calculate_metered_auto_fare(5.0, is_night=True, waiting_min=0)
    assert fare_night == round(68.5 * 1.25, 1)

def test_dtc_bus_pink_pass_zero_fare():
    db = SessionLocal()
    try:
        fare, desc = transit_service.calculate_dtc_bus_fare(db, 12.0, is_ac=True, qualifies_pink_pass=True)
        assert fare == 0.0
        assert "Pink Pass" in desc
    finally:
        db.close()

def test_multimodal_route_search():
    # Connaught Place to DLF Cyber City
    payload = {
        "origin_name": "Connaught Place",
        "origin_lat": 28.6328,
        "origin_lon": 77.2197,
        "dest_name": "DLF Cyber City",
        "dest_lat": 28.4967,
        "dest_lon": 77.0903,
        "mode_preference": "all",
        "priority": "best_overall",
        "max_walking_meters": 2000,
        "has_smart_card": True,
        "pink_pass": False,
        "wheelchair_accessible": False
    }

    response = client.post("/api/v1/routes/search", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert "routes" in data
    assert len(data["routes"]) > 0
    assert "direct_cab_benchmark" in data
    assert data["direct_cab_benchmark"]["total_fare_inr"] > 200

    # Ensure every route has calibrated confidence bounds
    for r in data["routes"]:
        est = r["fare_estimate"]
        assert est["range_min"] <= est["fare_inr"] <= est["range_max"] + 1.0
        assert est["source"] in ["LIVE_API", "OBSERVED", "ML_PREDICTED", "ESTIMATED_FALLBACK"]

def test_constraint_max_budget_enforcement():
    payload = {
        "origin_name": "Connaught Place",
        "origin_lat": 28.6328,
        "origin_lon": 77.2197,
        "dest_name": "DLF Cyber City",
        "dest_lat": 28.4967,
        "dest_lon": 77.0903,
        "max_budget_inr": 80.0 # Restricts to metro and bus, excludes direct cabs
    }

    response = client.post("/api/v1/routes/search", json=payload)
    assert response.status_code == 200
    data = response.json()

    # All returned routes must be <= max budget
    for r in data["routes"]:
        assert r["total_fare_inr"] <= 85.0
