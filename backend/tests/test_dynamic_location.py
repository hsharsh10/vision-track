import pytest
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)

def test_reverse_geocode_arbitrary_coords():
    """Verify reverse geocoding returns a standardized location for arbitrary coordinates."""
    response = client.post(
        "/api/v1/location/reverse-geocode",
        json={"latitude": 28.5284, "longitude": 77.2185}
    )
    assert response.status_code == 200
    data = response.json()
    assert "latitude" in data
    assert "longitude" in data
    assert abs(data["latitude"] - 28.5284) < 0.001
    assert "name" in data
    assert "formatted_address" in data

def test_autocomplete_search():
    """Verify autocomplete search returns matching places with debouncing/query."""
    response = client.get(
        "/api/v1/location/autocomplete",
        params={"q": "Saket", "lat": 28.5284, "lon": 77.2185}
    )
    assert response.status_code == 200
    results = response.json()
    assert isinstance(results, list)
    assert len(results) > 0
    first = results[0]
    assert "name" in first
    assert "latitude" in first
    assert "longitude" in first

def test_hindi_location_search():
    """Verify Hindi text query support."""
    response = client.get(
        "/api/v1/location/autocomplete",
        params={"q": "चांदनी चौक", "lat": 28.6506, "lon": 77.2303}
    )
    assert response.status_code == 200
    results = response.json()
    assert isinstance(results, list)

def test_dynamic_route_arbitrary_coordinates():
    """Verify multimodal route search handles arbitrary coordinates."""
    req_body = {
        "pickup": {
            "latitude": 28.5284,
            "longitude": 77.2185,
            "name": "Select Citywalk Saket",
            "formatted_address": "Saket District Centre, District Centre, Sector 6, Pushp Vihar, New Delhi, Delhi 110017",
            "source": "PLACES_AUTOCOMPLETE"
        },
        "destination": {
            "latitude": 28.4952,
            "longitude": 77.0894,
            "name": "DLF Cyber City, Gurugram",
            "formatted_address": "DLF Phase 2, Sector 24, Gurugram, Haryana 122002",
            "source": "PLACES_AUTOCOMPLETE"
        },
        "passenger_count": 1,
        "priority": "best_overall"
    }
    response = client.post("/api/v1/routes/search", json=req_body)
    assert response.status_code == 200
    data = response.json()
    assert "routes" in data
    assert len(data["routes"]) > 0
    first_route = data["routes"][0]
    assert len(first_route["legs"]) > 0
    # Walking distance must be computed from legs
    assert first_route["walking_distance_meters"] >= 0
    assert first_route["total_distance_meters"] > 0
    assert first_route["total_estimated_fare"] >= 0
