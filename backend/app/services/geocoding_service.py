import os
import json
import logging
import urllib.request
import urllib.parse
from typing import List, Optional, Tuple, Dict, Any
from sqlalchemy.orm import Session

from backend.app.schemas.schemas import StandardizedLocation, LocationSource
from backend.app.models.models import TransitStation, BusStop

logger = logging.getLogger("gatimarg.geocoding")

GOOGLE_MAPS_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "AIzaSyCqh4jRK4ZKwsmHn7PyNLYlAf0UbGxlnjI")

# In-memory LRU cache for geocoding
_GEOCODE_CACHE: Dict[str, Dict[str, Any]] = {}
_AUTOCOMPLETE_CACHE: Dict[str, List[Dict[str, Any]]] = {}

class GeocodingService:
    def __init__(self):
        self.user_agent = "GatiMargMobilityOptimizer/2.0 (contact: admin@gatimarg.in)"

    def validate_coordinates(self, lat: float, lon: float) -> bool:
        """Validates that latitude and longitude fall within physical bounds."""
        try:
            return -90.0 <= float(lat) <= 90.0 and -180.0 <= float(lon) <= 180.0
        except (ValueError, TypeError):
            return False

    def reverse_geocode(
        self,
        lat: float,
        lon: float,
        db: Optional[Session] = None,
        source: LocationSource = LocationSource.GPS
    ) -> StandardizedLocation:
        """
        Reverse geocodes arbitrary (lat, lon) coordinates into a human-readable address.
        Strategy:
          1. Check memory cache.
          2. Try Google Geocoding API if key is valid.
          3. Try OpenStreetMap Nominatim API (100% free, real-time, global).
          4. Fallback to nearest database landmark / metro station.
        """
        if not self.validate_coordinates(lat, lon):
            return StandardizedLocation(
                name="Invalid Location",
                formatted_address="Coordinates out of valid geographic range",
                latitude=lat,
                longitude=lon,
                source=source,
                accuracy_meters=0
            )

        cache_key = f"{round(lat, 5)},{round(lon, 5)}"
        if cache_key in _GEOCODE_CACHE:
            cached = _GEOCODE_CACHE[cache_key]
            return StandardizedLocation(**cached, source=source)

        # 1. Try Google Geocoding API
        if GOOGLE_MAPS_KEY:
            try:
                g_url = f"https://maps.googleapis.com/maps/api/geocode/json?latlng={lat},{lon}&key={GOOGLE_MAPS_KEY}"
                req = urllib.request.Request(g_url, headers={"User-Agent": self.user_agent})
                with urllib.request.urlopen(req, timeout=3) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    if data.get("status") == "OK" and data.get("results"):
                        first = data["results"][0]
                        name = first.get("address_components", [{}])[0].get("long_name") or first.get("formatted_address", "").split(",")[0]
                        loc_obj = {
                            "place_id": first.get("place_id"),
                            "name": name,
                            "formatted_address": first.get("formatted_address", ""),
                            "latitude": round(lat, 6),
                            "longitude": round(lon, 6),
                            "source": source.value,
                            "accuracy_meters": 10
                        }
                        _GEOCODE_CACHE[cache_key] = loc_obj
                        return StandardizedLocation(**loc_obj)
            except Exception as e:
                logger.debug(f"Google reverse geocode skipped: {e}")

        # 2. Try OpenStreetMap Nominatim API
        try:
            nom_url = f"https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lon}&format=json&addressdetails=1"
            req = urllib.request.Request(nom_url, headers={"User-Agent": self.user_agent})
            with urllib.request.urlopen(req, timeout=3.5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                display_name = data.get("display_name", "")
                addr = data.get("address", {})

                # Extract concise name: building, landmark, road, or locality
                name = (
                    addr.get("amenity") or
                    addr.get("building") or
                    addr.get("shop") or
                    addr.get("leisure") or
                    addr.get("tourism") or
                    addr.get("railway") or
                    addr.get("suburb") or
                    addr.get("neighbourhood") or
                    addr.get("road") or
                    display_name.split(",")[0]
                )

                loc_obj = {
                    "place_id": str(data.get("osm_id", "")),
                    "name": name,
                    "formatted_address": display_name,
                    "latitude": round(lat, 6),
                    "longitude": round(lon, 6),
                    "source": source.value,
                    "accuracy_meters": 15
                }
                _GEOCODE_CACHE[cache_key] = loc_obj
                return StandardizedLocation(**loc_obj)
        except Exception as e:
            logger.debug(f"Nominatim reverse geocode error: {e}")

        # 3. Fallback to nearest station/landmark in DB if available
        if db:
            try:
                from backend.app.services.transit_service import haversine_distance_km
                nearest = None
                min_dist = float("inf")
                for s in db.query(TransitStation).limit(100):
                    d = haversine_distance_km(lat, lon, s.latitude, s.longitude)
                    if d < min_dist:
                        min_dist = d
                        nearest = s
                if nearest and min_dist < 2.0:
                    name = f"Near {nearest.name} Metro"
                    addr = f"{nearest.name}, {nearest.line_name} Line, Delhi NCR, India"
                    loc_obj = {
                        "place_id": f"metro_{nearest.id}",
                        "name": name,
                        "formatted_address": addr,
                        "latitude": round(lat, 6),
                        "longitude": round(lon, 6),
                        "source": source.value,
                        "accuracy_meters": round(min_dist * 1000)
                    }
                    _GEOCODE_CACHE[cache_key] = loc_obj
                    return StandardizedLocation(**loc_obj)
            except Exception:
                pass

        # 4. Final coordinate fallback
        return StandardizedLocation(
            name=f"Location ({round(lat, 4)}, {round(lon, 4)})",
            formatted_address=f"Geographic point at {round(lat, 6)}, {round(lon, 6)}",
            latitude=round(lat, 6),
            longitude=round(lon, 6),
            source=source,
            accuracy_meters=20
        )

    def autocomplete_search(
        self,
        query: str,
        lat: Optional[float] = None,
        lon: Optional[float] = None,
        country: str = "in",
        db: Optional[Session] = None
    ) -> List[StandardizedLocation]:
        """
        Dynamic search across full addresses, streets, buildings, shops, malls,
        airports, railway stations, metro stations, bus stops, landmarks, and cities.
        Supports both English and Hindi.
        """
        clean_q = query.strip()
        if len(clean_q) < 2:
            return []

        cache_key = f"{clean_q.lower()}_{country}_{round(lat or 0, 2)}_{round(lon or 0, 2)}"
        if cache_key in _AUTOCOMPLETE_CACHE:
            return [StandardizedLocation(**x) for x in _AUTOCOMPLETE_CACHE[cache_key]]

        results: List[StandardizedLocation] = []
        seen_coords = set()

        # 1. Local Metro & Transit station match (instant, highly accurate)
        if db:
            try:
                q_lower = clean_q.lower()
                stations = db.query(TransitStation).filter(
                    TransitStation.name.ilike(f"%{clean_q}%")
                ).limit(5).all()

                for s in stations:
                    coord_key = (round(s.latitude, 4), round(s.longitude, 4))
                    if coord_key not in seen_coords:
                        seen_coords.add(coord_key)
                        results.append(StandardizedLocation(
                            place_id=f"dmrc_station_{s.id}",
                            name=f"{s.name} Metro Station",
                            formatted_address=f"{s.name} ({s.line_name} Line), Delhi NCR, India",
                            latitude=round(s.latitude, 6),
                            longitude=round(s.longitude, 6),
                            source=LocationSource.PLACES_AUTOCOMPLETE,
                            accuracy_meters=5
                        ))

                bus_stops = db.query(BusStop).filter(
                    BusStop.name.ilike(f"%{clean_q}%")
                ).limit(3).all()

                for b in bus_stops:
                    coord_key = (round(b.latitude, 4), round(b.longitude, 4))
                    if coord_key not in seen_coords:
                        seen_coords.add(coord_key)
                        results.append(StandardizedLocation(
                            place_id=f"dtc_bus_{b.id}",
                            name=f"{b.name} (Bus Stop)",
                            formatted_address=f"{b.name}, Delhi NCR, India",
                            latitude=round(b.latitude, 6),
                            longitude=round(b.longitude, 6),
                            source=LocationSource.PLACES_AUTOCOMPLETE,
                            accuracy_meters=10
                        ))
            except Exception as e:
                logger.debug(f"DB search error: {e}")

        # 2. Query Photon Geocoding Engine (Supports English + Hindi + Landmarks + Viewport Bias)
        try:
            bias_lat = lat if lat is not None else 28.6139
            bias_lon = lon if lon is not None else 77.2090
            encoded_q = urllib.parse.quote(clean_q)
            photon_url = f"https://photon.komoot.io/api/?q={encoded_q}&lat={bias_lat}&lon={bias_lon}&limit=8"

            req = urllib.request.Request(photon_url, headers={"User-Agent": self.user_agent})
            with urllib.request.urlopen(req, timeout=3.5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                for feature in data.get("features", []):
                    props = feature.get("properties", {})
                    geom = feature.get("geometry", {})
                    coords = geom.get("coordinates", [])
                    if len(coords) < 2:
                        continue

                    f_lon, f_lat = float(coords[0]), float(coords[1])
                    coord_key = (round(f_lat, 4), round(f_lon, 4))
                    if coord_key in seen_coords:
                        continue
                    seen_coords.add(coord_key)

                    name = props.get("name") or clean_q
                    parts = []
                    for key in ["street", "suburb", "city", "state", "country"]:
                        if props.get(key):
                            parts.append(props[key])
                    fmt_addr = f"{name}, {', '.join(parts)}" if parts else name

                    results.append(StandardizedLocation(
                        place_id=str(props.get("osm_id") or ""),
                        name=name,
                        formatted_address=fmt_addr,
                        latitude=round(f_lat, 6),
                        longitude=round(f_lon, 6),
                        source=LocationSource.PLACES_AUTOCOMPLETE,
                        accuracy_meters=props.get("extent", 15)
                    ))
        except Exception as e:
            logger.debug(f"Photon geocoding search error: {e}")

        # Cache results
        _AUTOCOMPLETE_CACHE[cache_key] = [r.dict() for r in results[:10]]
        return results[:10]

geocoding_service = GeocodingService()
