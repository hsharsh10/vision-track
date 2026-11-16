import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.schemas.schemas import ModeType

client = TestClient(app)

def test_scenario_1_walk_metro_walk():
    """
    Acceptance Test 1: Walk + Metro + Walk
    - Both walking segments appear in legs list.
    - Walking distance equals the sum of both segments.
    - Metro distance is calculated independently.
    - Both walking segments appear in the step breakdown.
    """
    payload = {
        "origin_name": "Connaught Place (Rajiv Chowk)",
        "origin_lat": 28.6328,
        "origin_lon": 77.2197,
        "dest_name": "AIIMS New Delhi",
        "dest_lat": 28.5683,
        "dest_lon": 77.2078,
        "mode_preference": "all",
        "priority": "cheapest"
    }
    response = client.post("/api/v1/routes/search", json=payload)
    assert response.status_code == 200
    data = response.json()

    # Find the Walk + Metro + Walk route
    wmw_routes = [r for r in data["routes"] if "WALK + METRO + WALK" in r["route_name"] or r["title"] == "Walk + DMRC Metro + Walk"]
    assert len(wmw_routes) > 0, "Walk + Metro + Walk route must be generated"
    wmw = wmw_routes[0]

    modes = [l["mode"] for l in wmw["legs"]]
    assert modes == ["WALK", "METRO", "WALK"]

    # Verify walking distance strictly equals the sum of both walking segments
    w1_dist = wmw["legs"][0]["distance_meters"]
    w2_dist = wmw["legs"][2]["distance_meters"]
    assert w1_dist > 0, "Origin walk must be > 0"
    assert w2_dist > 0, "Destination walk must be > 0"
    assert abs(wmw["walking_distance_meters"] - (w1_dist + w2_dist)) < 0.1

    # Verify metro distance calculated independently
    metro_dist = wmw["legs"][1]["distance_meters"]
    assert metro_dist > 4000, "Metro distance between CP and AIIMS should be > 4km"
    assert abs(wmw["metro_distance_meters"] - metro_dist) < 0.1

    # Verify geometry exists for all 3 segments
    for leg in wmw["legs"]:
        assert len(leg["decoded_coordinates"]) >= 2
        assert len(leg["encoded_polyline"]) > 0

    # Verify motorized count and transfers
    assert wmw["motorized_legs_count"] == 1
    assert wmw["transfer_count"] == 0

def test_scenario_2_cab_walk():
    """
    Acceptance Test 2: Cab + Walk
    - Cab road geometry is displayed.
    - Walking geometry is displayed separately.
    - Both distances are calculated.
    - Fare is assigned to the cab segment.
    """
    payload = {
        "origin_name": "Connaught Place",
        "origin_lat": 28.6328,
        "origin_lon": 77.2197,
        "dest_name": "DLF Cyber City, Gurugram",
        "dest_lat": 28.4967,
        "dest_lon": 77.0903,
        "mode_preference": "all",
        "priority": "comfortable"
    }
    response = client.post("/api/v1/routes/search", json=payload)
    assert response.status_code == 200
    data = response.json()

    cw_routes = [r for r in data["routes"] if "CAB + WALK" in r["route_name"] or "Cab + Walk" in r["title"]]
    assert len(cw_routes) > 0, "Cab + Walk route must be generated"
    cw = cw_routes[0]

    modes = [l["mode"] for l in cw["legs"]]
    assert modes == ["CAB", "WALK"]

    # Verify both distances are calculated
    assert cw["driving_distance_meters"] > 0
    assert cw["walking_distance_meters"] > 0
    assert abs(cw["total_distance_meters"] - (cw["driving_distance_meters"] + cw["walking_distance_meters"])) < 0.1

    # Verify fare is assigned to cab segment, walk is free
    assert cw["legs"][0]["fare"] > 100
    assert cw["legs"][1]["fare"] == 0.0

def test_scenario_3_auto_metro_walk():
    """
    Acceptance Test 3: Auto + Metro + Walk
    - Auto road route is visible.
    - Metro route is visible.
    - Walking route is visible.
    - Total fare includes both paid segments.
    - Walking distance is correct.
    """
    payload = {
        "origin_name": "Connaught Place",
        "origin_lat": 28.6328,
        "origin_lon": 77.2197,
        "dest_name": "DLF Cyber City, Gurugram",
        "dest_lat": 28.4967,
        "dest_lon": 77.0903,
        "mode_preference": "all",
        "priority": "best_overall"
    }
    response = client.post("/api/v1/routes/search", json=payload)
    assert response.status_code == 200
    data = response.json()

    amw_routes = [r for r in data["routes"] if "AUTO + METRO + WALK" in r["route_name"] or "Auto → Metro" in r["title"]]
    assert len(amw_routes) > 0, "Auto + Metro + Walk route must be generated"
    amw = amw_routes[0]

    modes = [l["mode"] for l in amw["legs"]]
    assert modes == ["AUTO", "METRO", "WALK"]

    # Verify all 3 segments have valid polylines
    for leg in amw["legs"]:
        assert len(leg["decoded_coordinates"]) >= 2
        assert len(leg["encoded_polyline"]) > 0

    # Total fare includes Auto + Metro
    auto_fare = amw["legs"][0]["fare"]
    metro_fare = amw["legs"][1]["fare"]
    walk_fare = amw["legs"][2]["fare"]
    assert auto_fare > 25
    assert metro_fare > 20
    assert walk_fare == 0.0
    assert abs(amw["total_estimated_fare"] - (auto_fare + metro_fare)) < 0.1

    # Walking distance is strictly the walking leg distance
    assert amw["walking_distance_meters"] == amw["legs"][2]["distance_meters"]
    metro_interchanges = amw["legs"][1]["vehicle_or_transit_details"].get("interchanges", 0)
    assert amw["transfer_count"] == 1 + metro_interchanges
    assert amw["motorized_legs_count"] == 2

def test_scenario_4_walk_bus_metro_walk():
    """
    Acceptance Test 4: Walk + Bus + Metro + Walk
    - All four segments are displayed.
    - Bus and metro stops are identified.
    - Walking distances are calculated correctly.
    - Transfers are counted correctly.
    """
    payload = {
        "origin_name": "Connaught Place",
        "origin_lat": 28.6328,
        "origin_lon": 77.2197,
        "dest_name": "DLF Cyber City, Gurugram",
        "dest_lat": 28.4967,
        "dest_lon": 77.0903,
        "mode_preference": "all"
    }
    response = client.post("/api/v1/routes/search", json=payload)
    assert response.status_code == 200
    data = response.json()

    wbmw_routes = [r for r in data["routes"] if "WALK + BUS + METRO + WALK" in r["route_name"]]
    assert len(wbmw_routes) > 0, "Walk + Bus + Metro + Walk route must be generated"
    wbmw = wbmw_routes[0]

    modes = [l["mode"] for l in wbmw["legs"]]
    assert modes == ["WALK", "BUS", "METRO", "WALK"]

    # Bus and metro stops identified
    assert "Terminal" in wbmw["legs"][1]["start_location"]["name"] or "Bus" in wbmw["legs"][1]["start_location"]["name"] or "Connaught Place" in wbmw["legs"][1]["start_location"]["name"]
    assert "Metro" in wbmw["legs"][2]["start_location"]["name"]

    # Walking distances sum
    expected_walk = wbmw["legs"][0]["distance_meters"] + wbmw["legs"][3]["distance_meters"]
    assert abs(wbmw["walking_distance_meters"] - expected_walk) < 0.1

    # Transfers: Bus to Metro = 1 transfer
    assert wbmw["transfer_count"] >= 1
    assert wbmw["motorized_legs_count"] == 2

def test_scenario_5_direct_cab():
    """
    Acceptance Test 5: Direct Cab
    - Complete cab road route is visible.
    - Walking distance is calculated if access or egress walking exists.
    - Cab fare and duration are displayed.
    """
    payload = {
        "origin_name": "Connaught Place",
        "origin_lat": 28.6328,
        "origin_lon": 77.2197,
        "dest_name": "DLF Cyber City, Gurugram",
        "dest_lat": 28.4967,
        "dest_lon": 77.0903,
        "mode_preference": "cab_auto_only"
    }
    response = client.post("/api/v1/routes/search", json=payload)
    assert response.status_code == 200
    data = response.json()

    cab_routes = [r for r in data["routes"] if r["route_name"] == "CAB" or "Direct Cab" in r["title"]]
    assert len(cab_routes) > 0, "Direct cab route must be present"
    cab = cab_routes[0]

    assert cab["legs"][0]["mode"] == "CAB"
    assert len(cab["legs"][0]["decoded_coordinates"]) >= 2
    assert cab["driving_distance_meters"] > 15000  # CP to Cyber City is ~23 km
    assert cab["total_estimated_fare"] > 250
    assert cab["total_journey_duration_min"] > 15
    assert cab["motorized_legs_count"] == 1
    assert cab["transfer_count"] == 0
