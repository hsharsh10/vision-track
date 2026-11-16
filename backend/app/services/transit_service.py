import math
import networkx as nx
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from backend.app.models.models import TransitStation, BusStop, TransitFareRule, ProviderVehicleCategory
from backend.app.schemas.schemas import FareEstimate, FareSource

def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates great-circle distance between two coordinates in kilometers."""
    R = 6371.0  # Earth's radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(R * c, 3)

class TransitService:
    def __init__(self):
        self.metro_graph = nx.Graph()
        self.stations: Dict[int, TransitStation] = {}
        self.is_graph_built = False

    def build_network_graph(self, db: Session):
        """Constructs the DMRC NetworkX graph with real lines and interchange buffers."""
        stations = db.query(TransitStation).all()
        self.stations = {s.id: s for s in stations}
        self.metro_graph.clear()

        # Add nodes
        for s in stations:
            self.metro_graph.add_node(
                s.id,
                name=s.name,
                line=s.line_name,
                color=s.line_color,
                lat=s.latitude,
                lon=s.longitude,
                interchange=s.is_interchange
            )

        # Connect consecutive stations on the same line
        lines: Dict[str, List[TransitStation]] = {}
        for s in stations:
            lines.setdefault(s.line_name, []).append(s)

        for line_name, line_stations in lines.items():
            sorted_stations = sorted(line_stations, key=lambda x: x.sequence_order)
            for i in range(len(sorted_stations) - 1):
                s1 = sorted_stations[i]
                s2 = sorted_stations[i + 1]
                dist = haversine_distance_km(s1.latitude, s1.longitude, s2.latitude, s2.longitude)
                # Average metro speed ~ 33 km/h = 1.8 mins per km + 0.5 min dwell time
                travel_time_min = (dist / 33.0) * 60.0 + 0.5
                self.metro_graph.add_edge(
                    s1.id, s2.id,
                    weight=travel_time_min,
                    distance_km=dist,
                    line=line_name,
                    edge_type="LINE"
                )

        # Connect interchange stations
        # Stations with same name or explicitly linked
        station_list = list(stations)
        for i in range(len(station_list)):
            for j in range(i + 1, len(station_list)):
                s1 = station_list[i]
                s2 = station_list[j]
                if s1.line_name != s2.line_name:
                    dist = haversine_distance_km(s1.latitude, s1.longitude, s2.latitude, s2.longitude)
                    # If same physical station or close proximity < 0.4 km
                    if dist <= 0.4 or s1.name.split(" ")[0].lower() == s2.name.split(" ")[0].lower():
                        # Interchange buffer: 4.0 minutes walk/transfer
                        self.metro_graph.add_edge(
                            s1.id, s2.id,
                            weight=4.0,
                            distance_km=0.2,
                            line="INTERCHANGE",
                            edge_type="TRANSFER"
                        )

        self.is_graph_built = True

    def find_nearest_stations(
        self, db: Session, lat: float, lon: float, max_radius_km: float = 6.0, limit: int = 4
    ) -> List[Tuple[TransitStation, float]]:
        """Finds closest metro stations within radius in km."""
        stations = db.query(TransitStation).all()
        results = []
        for s in stations:
            d = haversine_distance_km(lat, lon, s.latitude, s.longitude)
            if d <= max_radius_km:
                results.append((s, d))
        results.sort(key=lambda x: x[1])
        return results[:limit]

    def find_nearest_bus_stops(
        self, db: Session, lat: float, lon: float, max_radius_km: float = 2.5, limit: int = 2
    ) -> List[Tuple[BusStop, float]]:
        stops = db.query(BusStop).all()
        results = []
        for b in stops:
            d = haversine_distance_km(lat, lon, b.latitude, b.longitude)
            if d <= max_radius_km:
                results.append((b, d))
        results.sort(key=lambda x: x[1])
        return results[:limit]

    def calculate_dmrc_fare(
        self, db: Session, distance_km: float, has_smart_card: bool = True, is_off_peak: bool = False
    ) -> Tuple[float, str]:
        """Calculates DMRC fare according to official distance slabs and smart card discounts."""
        rules = db.query(TransitFareRule).filter(TransitFareRule.system == "DMRC").all()
        applicable = None
        for r in rules:
            if r.min_distance_km <= distance_km < r.max_distance_km:
                applicable = r
                break
        if not applicable and rules:
            applicable = sorted(rules, key=lambda x: x.max_distance_km)[-1]

        if not applicable:
            return 32.0, "DMRC Standard Flat"

        if has_smart_card:
            if is_off_peak:
                return round(applicable.off_peak_fare, 1), "DMRC Smart Card (20% Off-Peak)"
            return round(applicable.smart_card_fare, 1), "DMRC Smart Card (10% Discount)"
        return round(applicable.standard_fare, 1), "DMRC Standard Token"

    def plan_metro_journey(
        self, db: Session, start_station: TransitStation, end_station: TransitStation,
        has_smart_card: bool = True, is_off_peak: bool = False
    ) -> Optional[Dict[str, Any]]:
        if not self.is_graph_built:
            self.build_network_graph(db)

        if start_station.id == end_station.id:
            return None

        try:
            path_ids = nx.shortest_path(self.metro_graph, source=start_station.id, target=end_station.id, weight="weight")
            total_duration_min = 0.0
            total_distance_km = 0.0
            segments = []
            current_line = None
            current_seg_stations = []

            for i in range(len(path_ids) - 1):
                u = path_ids[i]
                v = path_ids[i + 1]
                edge_data = self.metro_graph[u][v]
                s_u = self.stations[u]
                s_v = self.stations[v]

                total_duration_min += edge_data.get("weight", 2.0)
                total_distance_km += edge_data.get("distance_km", 1.2)

                line = edge_data.get("line")
                if edge_data.get("edge_type") == "TRANSFER":
                    # Line interchange
                    if current_seg_stations:
                        segments.append({
                            "line": current_line,
                            "stations": current_seg_stations,
                            "from": current_seg_stations[0].name,
                            "to": current_seg_stations[-1].name
                        })
                        current_seg_stations = []
                    current_line = None
                else:
                    if current_line is None:
                        current_line = line
                        current_seg_stations = [s_u, s_v]
                    elif current_line == line:
                        current_seg_stations.append(s_v)
                    else:
                        segments.append({
                            "line": current_line,
                            "stations": current_seg_stations,
                            "from": current_seg_stations[0].name,
                            "to": current_seg_stations[-1].name
                        })
                        current_line = line
                        current_seg_stations = [s_u, s_v]

            if current_seg_stations:
                segments.append({
                    "line": current_line,
                    "stations": current_seg_stations,
                    "from": current_seg_stations[0].name,
                    "to": current_seg_stations[-1].name
                })

            fare_inr, fare_desc = self.calculate_dmrc_fare(
                db, total_distance_km, has_smart_card=has_smart_card, is_off_peak=is_off_peak
            )

            path_coords = [[self.stations[sid].latitude, self.stations[sid].longitude] for sid in path_ids]

            return {
                "start_station": start_station,
                "end_station": end_station,
                "station_count": len(path_ids),
                "distance_km": round(total_distance_km, 2),
                "duration_min": round(total_duration_min, 1),
                "fare_inr": fare_inr,
                "fare_desc": fare_desc,
                "interchanges": max(0, len(segments) - 1),
                "line_segments": segments,
                "path_coords": path_coords
            }
        except nx.NetworkXNoPath:
            return None

    def calculate_metered_auto_fare(self, distance_km: float, is_night: bool = False, waiting_min: float = 5.0) -> Tuple[float, Dict[str, Any]]:
        """GNCTD official auto meter: ₹30 for first 1.5km + ₹11/km + 25% night surcharge (11PM-5AM)."""
        base_dist = 1.5
        base_fare = 30.0
        extra_km = max(0.0, distance_km - base_dist)
        dist_charge = extra_km * 11.0
        waiting_charge = waiting_min * 0.75
        subtotal = base_fare + dist_charge + waiting_charge
        surcharge = subtotal * 0.25 if is_night else 0.0
        total = round(subtotal + surcharge, 1)

        return total, {
            "base_fare": base_fare,
            "dist_charge": round(dist_charge, 1),
            "waiting_charge": round(waiting_charge, 1),
            "night_surcharge": round(surcharge, 1)
        }

    def calculate_dtc_bus_fare(self, db: Session, distance_km: float, is_ac: bool = True, qualifies_pink_pass: bool = False) -> Tuple[float, str]:
        """Calculates DTC Bus fare with support for Delhi Govt Pink Pass (₹0 for women)."""
        if qualifies_pink_pass:
            return 0.0, "DTC Pink Pass (Free Travel for Women)"

        system_name = "DTC_AC" if is_ac else "DTC_NON_AC"
        rules = db.query(TransitFareRule).filter(TransitFareRule.system == system_name).all()
        for r in rules:
            if r.min_distance_km <= distance_km < r.max_distance_km:
                return r.standard_fare, f"{'AC' if is_ac else 'Non-AC'} Bus Ticket"
        return (25.0 if is_ac else 15.0), f"{'AC' if is_ac else 'Non-AC'} Bus Ticket"

transit_service = TransitService()
