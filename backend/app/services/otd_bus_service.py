import os
import time
import math
import logging
import urllib.request
from typing import List, Dict, Any, Optional

logger = logging.getLogger("gatimarg.transit.otd")

# -----------------------------------------------------------------------------
# Delhi Open Transit Data (OTD) Platform - Real-Time Bus API Integration
# Provides live GPS tracking of 3,700+ DTC & Cluster buses across Delhi NCR.
# Endpoint: https://otd.delhi.gov.in/api/realtime/VehiclePositions.pb
# -----------------------------------------------------------------------------
OTD_DELHI_API_KEY = os.getenv(
    "OTD_DELHI_API_KEY",
    "2fCK9ablX7HotrJtpki3OWgWKLtMKRL6"
)
OTD_VEHICLE_POSITIONS_URL = f"https://otd.delhi.gov.in/api/realtime/VehiclePositions.pb?key={OTD_DELHI_API_KEY}"

# In-memory cache to respect API rates and serve sub-millisecond responses
_LIVE_BUSES_CACHE: List[Dict[str, Any]] = []
_LAST_FETCH_TIMESTAMP: float = 0.0
_CACHE_TTL_SECONDS: float = 45.0  # Freshness window for real-time bus positions


def _haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates great-circle distance in meters between two coordinates."""
    R = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (math.sin(dphi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


class OTDBusService:
    """
    Service client for Delhi Open Transit Data (OTD) real-time GTFS-RT bus feeds.
    Queries live vehicle positions, calculates distances to passenger pickup stops,
    and supplies live bus registration numbers and real-time ETAs to GatiMarg routing.
    """

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or OTD_DELHI_API_KEY
        self.url = f"https://otd.delhi.gov.in/api/realtime/VehiclePositions.pb?key={self.api_key}"

    def fetch_live_bus_positions(self, force_refresh: bool = False) -> List[Dict[str, Any]]:
        """
        Fetches and decodes the latest real-time VehiclePositions feed from OTD Delhi.
        Caches results for 45 seconds to maximize throughput and minimize network latency.
        """
        global _LIVE_BUSES_CACHE, _LAST_FETCH_TIMESTAMP
        now = time.time()

        if not force_refresh and _LIVE_BUSES_CACHE and (now - _LAST_FETCH_TIMESTAMP < _CACHE_TTL_SECONDS):
            return _LIVE_BUSES_CACHE

        try:
            from google.transit import gtfs_realtime_pb2
            feed = gtfs_realtime_pb2.FeedMessage()

            req = urllib.request.Request(
                self.url,
                headers={"User-Agent": "GatiMargDelhiTransitClient/2.0"}
            )
            with urllib.request.urlopen(req, timeout=12) as response:
                content = response.read()

            feed.ParseFromString(content)

            vehicles = []
            for entity in feed.entity:
                if entity.HasField("vehicle"):
                    v = entity.vehicle
                    pos = v.position
                    trip = v.trip

                    v_id = v.vehicle.id if v.HasField("vehicle") and v.vehicle.id else entity.id
                    route_id = trip.route_id if trip.HasField("route_id") else ""
                    trip_id = trip.trip_id if trip.HasField("trip_id") else ""

                    speed_mps = pos.speed if pos.HasField("speed") else 0.0
                    speed_kmh = round(speed_mps * 3.6, 1)

                    vehicles.append({
                        "vehicle_id": v_id,
                        "route_id": route_id,
                        "trip_id": trip_id,
                        "latitude": round(pos.latitude, 6),
                        "longitude": round(pos.longitude, 6),
                        "speed_kmh": speed_kmh,
                        "timestamp": v.timestamp if v.HasField("timestamp") else int(now),
                    })

            _LIVE_BUSES_CACHE = vehicles
            _LAST_FETCH_TIMESTAMP = now
            logger.info(f"Successfully fetched {len(vehicles)} live DTC/Cluster bus positions from Delhi OTD.")
            return vehicles

        except Exception as e:
            logger.warning(f"Failed to fetch live bus positions from OTD Delhi: {e}")
            # If fetch fails, return existing cache rather than failing
            return _LIVE_BUSES_CACHE

    def get_live_buses_near(
        self,
        lat: float,
        lon: float,
        radius_km: float = 3.5,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Finds all active live DTC/Cluster buses within radius_km of a given coordinate.
        Returns buses sorted by proximity, with distance in meters and arrival ETA in minutes.
        """
        all_buses = self.fetch_live_bus_positions()
        if not all_buses:
            return []

        radius_m = radius_km * 1000.0
        nearby = []

        for b in all_buses:
            b_lat = b.get("latitude")
            b_lon = b.get("longitude")
            if b_lat is None or b_lon is None:
                continue

            dist_m = _haversine_meters(lat, lon, b_lat, b_lon)
            if dist_m <= radius_m:
                # Use live OTD bus speed if moving (>= 5 km/h), else Delhi avg ~18 km/h
                raw_speed = b.get("speed_kmh") or 0.0
                eff_speed_kmh = min(35.0, max(10.0, raw_speed)) if raw_speed >= 5.0 else 18.0
                meters_per_min = (eff_speed_kmh * 1000.0) / 60.0
                eta_min = max(1, round(dist_m / meters_per_min))
                nearby.append({
                    **b,
                    "distance_meters": round(dist_m),
                    "eta_minutes": eta_min,
                    "effective_speed_kmh": round(eff_speed_kmh, 1)
                })

        nearby.sort(key=lambda x: x["distance_meters"])
        return nearby[:limit]

    def get_corridor_bus_speed_kmh(
        self,
        orig_lat: float,
        orig_lon: float,
        dest_lat: float,
        dest_lon: float,
        radius_km: float = 4.0
    ) -> Optional[float]:
        """
        Estimates live bus corridor speed (km/h) by averaging moving OTD buses
        near the origin, midpoint, and destination. Returns None if no live buses found.
        """
        all_buses = self.fetch_live_bus_positions()
        if not all_buses:
            return None

        mid_lat = (orig_lat + dest_lat) / 2.0
        mid_lon = (orig_lon + dest_lon) / 2.0
        radius_m = radius_km * 1000.0
        moving_speeds: List[float] = []

        for b in all_buses:
            raw_speed = b.get("speed_kmh") or 0.0
            if raw_speed < 5.0:
                continue
            b_lat, b_lon = b.get("latitude"), b.get("longitude")
            if b_lat is None or b_lon is None:
                continue
            if (
                _haversine_meters(orig_lat, orig_lon, b_lat, b_lon) <= radius_m
                or _haversine_meters(mid_lat, mid_lon, b_lat, b_lon) <= radius_m
                or _haversine_meters(dest_lat, dest_lon, b_lat, b_lon) <= radius_m
            ):
                moving_speeds.append(min(35.0, max(10.0, raw_speed)))

        if not moving_speeds:
            return None
        avg_speed = sum(moving_speeds) / len(moving_speeds)
        return round(min(32.0, max(12.0, avg_speed)), 1)

    def get_nearest_live_bus_summary(
        self,
        lat: float,
        lon: float,
        radius_km: float = 4.0
    ) -> Optional[Dict[str, Any]]:
        """
        Returns a concise real-time summary of the nearest live bus to enhance route cards.
        """
        nearby = self.get_live_buses_near(lat, lon, radius_km=radius_km, limit=5)
        if not nearby:
            return None

        nearest = nearby[0]
        return {
            "has_live_tracking": True,
            "nearest_bus_reg": nearest["vehicle_id"],
            "nearest_route_id": nearest["route_id"],
            "distance_m": nearest["distance_meters"],
            "eta_min": nearest["eta_minutes"],
            "active_buses_count": len(nearby),
            "speed_kmh": nearest["speed_kmh"],
            "data_source": "Delhi Open Transit Data (Live GPS Feed)"
        }


otd_bus_service = OTDBusService()
