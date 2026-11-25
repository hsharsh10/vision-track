import uuid
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session

from backend.app.schemas.schemas import (
    SearchRequest, SearchResponse, RouteOption, RouteLeg, ModeType,
    FareEstimate, FareSource, RoutePriority, TravelModeFilter, LocationInfo
)
from backend.app.services.transit_service import transit_service, haversine_distance_km
from backend.app.services.pricing_service import pricing_service
from backend.app.services.geometry_service import (
    get_leg_route_geometry, encode_polyline, haversine_distance_m, prefetch_ola_distance_matrix
)
from backend.app.services.otd_bus_service import otd_bus_service

logger = logging.getLogger("gatimarg.routing")
logging.basicConfig(level=logging.INFO)

class RoutingService:
    def __init__(self):
        pass

    def _build_leg(
        self,
        route_id: str,
        seq: int,
        mode: ModeType,
        provider: str,
        start_name: str,
        start_lat: float,
        start_lon: float,
        end_name: str,
        end_lat: float,
        end_lon: float,
        fare: float,
        instructions: str,
        line_color: str,
        start_dt: datetime,
        vehicle_details: Optional[Dict[str, Any]] = None,
        custom_geom: Optional[Tuple[float, float, str, List[List[float]]]] = None
    ) -> RouteLeg:
        """
        Constructs a standardized RouteLeg with verified geometry and timing.
        """
        vehicle_details = vehicle_details or {}

        if custom_geom:
            dist_m, dur_s, encoded_poly, decoded_coords = custom_geom
        else:
            geom_mode = mode.value
            dist_m, dur_s, encoded_poly, decoded_coords = get_leg_route_geometry(
                start_lat, start_lon, end_lat, end_lon, geom_mode
            )

        # Ensure start and end coordinates snap cleanly
        if decoded_coords:
            decoded_coords[0] = [round(start_lat, 6), round(start_lon, 6)]
            decoded_coords[-1] = [round(end_lat, 6), round(end_lon, 6)]
            encoded_poly = encode_polyline(decoded_coords)
        else:
            decoded_coords = [[round(start_lat, 6), round(start_lon, 6)], [round(end_lat, 6), round(end_lon, 6)]]
            encoded_poly = encode_polyline(decoded_coords)

        end_dt = start_dt + timedelta(seconds=dur_s)

        leg_fare_est = FareEstimate(
            fare_inr=round(fare, 1),
            range_min=round(fare * 0.95, 1),
            range_max=round(fare * 1.05, 1),
            confidence="High",
            source=FareSource.ESTIMATED_FALLBACK if mode in [ModeType.METRO, ModeType.BUS, ModeType.WALK] else FareSource.ML_PREDICTED,
            data_freshness_desc=f"{provider} Tariff / Model"
        )

        return RouteLeg(
            leg_id=f"{route_id}_leg_{seq}",
            sequence=seq,
            mode=mode,
            provider=provider,
            start_location=LocationInfo(name=start_name, latitude=round(start_lat, 6), longitude=round(start_lon, 6)),
            end_location=LocationInfo(name=end_name, latitude=round(end_lat, 6), longitude=round(end_lon, 6)),
            distance_meters=round(dist_m, 1),
            duration_seconds=round(dur_s, 1),
            fare=round(fare, 1),
            start_time=start_dt.strftime("%H:%M"),
            end_time=end_dt.strftime("%H:%M"),
            encoded_polyline=encoded_poly,
            decoded_coordinates=decoded_coords,
            vehicle_or_transit_details=vehicle_details,
            instructions=instructions,
            line_color=line_color,
            fare_estimate=leg_fare_est
        )

    def _assemble_route(
        self,
        route_id: str,
        title: str,
        route_name: str,
        category_tag: str,
        summary_badges: List[str],
        legs: List[RouteLeg],
        fare_estimate: FareEstimate,
        direct_cab_fare: float,
        co2_saved_kg: float = 0.0,
        score: float = 0.0,
        is_recommended: bool = False
    ) -> RouteOption:
        """
        Assembles a RouteOption calculating all statistics strictly from the individual legs.
        Rule:
          walking_distance = sum(distance of all WALK legs)
          driving_distance = sum(distance of CAB, AUTO, BIKE legs)
          metro_distance = sum(distance of METRO legs)
          bus_distance = sum(distance of BUS legs)
          total_distance = sum(distance of all legs)
          total_fare = sum(fare of all legs)
          transfers = actual changes between motorized vehicle services
          motorized_legs_count = number of motorized legs
        """
        # Connect sequential leg coordinates so there are no disjoint gaps
        for i in range(1, len(legs)):
            prev_end = legs[i - 1].end_location
            legs[i].start_location.latitude = prev_end.latitude
            legs[i].start_location.longitude = prev_end.longitude
            if legs[i].decoded_coordinates and legs[i - 1].decoded_coordinates:
                legs[i].decoded_coordinates[0] = legs[i - 1].decoded_coordinates[-1]
                legs[i].encoded_polyline = encode_polyline(legs[i].decoded_coordinates)

        walking_m = sum(l.distance_meters for l in legs if l.mode == ModeType.WALK)
        driving_m = sum(l.distance_meters for l in legs if l.mode in [ModeType.CAB, ModeType.AUTO, ModeType.BIKE])
        metro_m = sum(l.distance_meters for l in legs if l.mode == ModeType.METRO)
        bus_m = sum(l.distance_meters for l in legs if l.mode == ModeType.BUS)
        total_m = sum(l.distance_meters for l in legs)

        total_fare = round(sum(l.fare for l in legs), 1)

        # Durations
        tot_dur_sec = sum(l.duration_seconds for l in legs)
        # Add transit transfer dwell buffer (e.g. 3 mins per transfer)
        motorized = [l for l in legs if l.mode in [ModeType.CAB, ModeType.AUTO, ModeType.BIKE, ModeType.METRO, ModeType.BUS]]
        motorized_count = len(motorized)

        # Transfers count: changes between distinct motorized services
        transfers = max(0, motorized_count - 1)
        # Add any intra-metro line interchanges
        for l in legs:
            if l.mode == ModeType.METRO:
                transfers += l.vehicle_or_transit_details.get("interchanges", 0)

        # Additional transfer waiting time
        transfer_wait_sec = transfers * 180.0  # 3 mins per transfer
        final_dur_sec = tot_dur_sec + transfer_wait_sec
        final_dur_min = round(final_dur_sec / 60.0, 1)

        departure_time = legs[0].start_time if legs else datetime.now().strftime("%H:%M")
        # Recompute arrival time based on final duration
        dep_dt = datetime.strptime(departure_time, "%H:%M")
        arrival_dt = dep_dt + timedelta(seconds=final_dur_sec)
        arrival_time = arrival_dt.strftime("%H:%M")

        # Re-calibrate overall fare estimate bounds
        fare_est = FareEstimate(
            fare_inr=total_fare,
            range_min=round(total_fare * 0.94, 1),
            range_max=round(total_fare * 1.08, 1),
            confidence=fare_estimate.confidence if fare_estimate else "High",
            source=fare_estimate.source if fare_estimate else FareSource.ML_PREDICTED,
            data_freshness_desc=fare_estimate.data_freshness_desc if fare_estimate else "Standardized Multimodal Pipeline"
        )

        savings = max(0.0, round(direct_cab_fare - total_fare, 1))

        # Log individual leg statistics for verification
        logger.info(
            f"Route '{title}': legs={len(legs)}, motorized={motorized_count}, transfers={transfers}, "
            f"walk_m={walking_m}, drive_m={driving_m}, metro_m={metro_m}, bus_m={bus_m}, fare=₹{total_fare}, dur={final_dur_min}m"
        )

        return RouteOption(
            id=route_id,
            title=title,
            route_name=route_name,
            summary_badges=summary_badges,
            category_tag=category_tag,
            departure_time=departure_time,
            arrival_time=arrival_time,
            total_estimated_fare=total_fare,
            total_fare_inr=total_fare,
            fare_estimate=fare_est,
            direct_cab_savings_inr=savings,
            direct_cab_fare_inr=direct_cab_fare,
            total_journey_duration_min=final_dur_min,
            total_duration_min=final_dur_min,
            total_duration_seconds=final_dur_sec,
            walking_distance_meters=round(walking_m, 1),
            driving_distance_meters=round(driving_m, 1),
            metro_distance_meters=round(metro_m, 1),
            bus_distance_meters=round(bus_m, 1),
            total_distance_meters=round(total_m, 1),
            total_walking_km=round(walking_m / 1000.0, 3),
            transfer_count=transfers,
            motorized_legs_count=motorized_count,
            co2_saved_kg=round(co2_saved_kg, 2),
            score=score,
            is_recommended=is_recommended,
            legs=legs,
            segments=legs
        )

    def search_multimodal_routes(self, db: Session, req: SearchRequest) -> SearchResponse:
        start_time = datetime.now()
        base_departure_dt = datetime.now()

        # Resolve arbitrary coordinates dynamically
        o_name, o_lat, o_lon = req.resolve_pickup()
        d_name, d_lat, d_lon = req.resolve_dest()
        req.origin_name = o_name
        req.origin_lat = o_lat
        req.origin_lon = o_lon
        req.dest_name = d_name
        req.dest_lat = d_lat
        req.dest_lon = d_lon

        # -------------------------------------------------------------
        # 1. Benchmark: Direct Cab (Uber Go)
        # -------------------------------------------------------------
        cab_dist_m, cab_dur_s, cab_poly, cab_coords = get_leg_route_geometry(
            req.origin_lat, req.origin_lon, req.dest_lat, req.dest_lon, "CAB"
        )
        cab_dist_km = round(cab_dist_m / 1000.0, 2)
        cab_dur_min = round(cab_dur_s / 60.0, 1)

        direct_cab_fare_est = pricing_service.get_ride_fare_estimate(
            db=db,
            provider_code="uber",
            category_code="uber_go",
            distance_km=cab_dist_km,
            duration_min=cab_dur_min,
            pickup_lat=req.origin_lat,
            pickup_lon=req.origin_lon,
            drop_lat=req.dest_lat,
            drop_lon=req.dest_lon
        )
        benchmark_fare = direct_cab_fare_est.fare_inr

        cab_leg = self._build_leg(
            route_id="benchmark_cab",
            seq=1,
            mode=ModeType.CAB,
            provider="Uber",
            start_name=req.origin_name,
            start_lat=req.origin_lat,
            start_lon=req.origin_lon,
            end_name=req.dest_name,
            end_lat=req.dest_lat,
            end_lon=req.dest_lon,
            fare=benchmark_fare,
            instructions=f"Take Uber Go directly from {req.origin_name} to {req.dest_name}",
            line_color="#0D9488",  # Teal solid for Cab/Auto
            start_dt=base_departure_dt,
            vehicle_details={"vehicle_type": "Cab", "category": "Uber Go"},
            custom_geom=(cab_dist_m, cab_dur_s, cab_poly, cab_coords)
        )

        direct_cab_benchmark = self._assemble_route(
            route_id=str(uuid.uuid4())[:8],
            title="Direct Cab (Uber Go)",
            route_name="CAB",
            category_tag="DIRECT_CAB",
            summary_badges=["Direct Route", "Air Conditioned", "Door-to-Door"],
            legs=[cab_leg],
            fare_estimate=direct_cab_fare_est,
            direct_cab_fare=benchmark_fare,
            co2_saved_kg=0.0
        )

        generated_routes: List[RouteOption] = []

        # -------------------------------------------------------------
        # 2. Direct On-Demand Options (Cab, Auto, Bike, Metered Auto)
        # -------------------------------------------------------------
        if req.mode_preference in [TravelModeFilter.ALL, TravelModeFilter.CAB_AUTO_ONLY]:
            # Always include direct cab
            generated_routes.append(direct_cab_benchmark)

            # Direct Rapido Auto
            auto_fare_est = pricing_service.get_ride_fare_estimate(
                db=db,
                provider_code="rapido",
                category_code="rapido_auto",
                distance_km=cab_dist_km,
                duration_min=cab_dur_min * 1.15,
                pickup_lat=req.origin_lat,
                pickup_lon=req.origin_lon,
                drop_lat=req.dest_lat,
                drop_lon=req.dest_lon
            )
            auto_leg = self._build_leg(
                route_id=str(uuid.uuid4())[:8],
                seq=1,
                mode=ModeType.AUTO,
                provider="Rapido",
                start_name=req.origin_name,
                start_lat=req.origin_lat,
                start_lon=req.origin_lon,
                end_name=req.dest_name,
                end_lat=req.dest_lat,
                end_lon=req.dest_lon,
                fare=auto_fare_est.fare_inr,
                instructions=f"Book Rapido Auto from {req.origin_name} directly to {req.dest_name}",
                line_color="#0D9488",  # Teal solid for Auto
                start_dt=base_departure_dt,
                vehicle_details={"vehicle_type": "Auto", "category": "Rapido Auto"},
                custom_geom=(cab_dist_m, cab_dur_s * 1.12, cab_poly, cab_coords)
            )
            generated_routes.append(self._assemble_route(
                route_id=str(uuid.uuid4())[:8],
                title="Rapido Auto",
                route_name="AUTO",
                category_tag="DIRECT_AUTO",
                summary_badges=["Direct Route", "App Booking"],
                legs=[auto_leg],
                fare_estimate=auto_fare_est,
                direct_cab_fare=benchmark_fare,
                co2_saved_kg=round(cab_dist_km * 0.05, 2)
            ))

            # Direct Bike Taxi (for solo travelers and not wheelchair)
            if req.passenger_count == 1 and not req.wheelchair_accessible:
                bike_dist_m, bike_dur_s, bike_poly, bike_coords = get_leg_route_geometry(
                    req.origin_lat, req.origin_lon, req.dest_lat, req.dest_lon, "BIKE"
                )
                bike_fare_est = pricing_service.get_ride_fare_estimate(
                    db=db,
                    provider_code="rapido",
                    category_code="rapido_bike",
                    distance_km=round(bike_dist_m / 1000.0, 2),
                    duration_min=round(bike_dur_s / 60.0, 1),
                    pickup_lat=req.origin_lat,
                    pickup_lon=req.origin_lon,
                    drop_lat=req.dest_lat,
                    drop_lon=req.dest_lon
                )
                bike_leg = self._build_leg(
                    route_id=str(uuid.uuid4())[:8],
                    seq=1,
                    mode=ModeType.BIKE,
                    provider="Rapido",
                    start_name=req.origin_name,
                    start_lat=req.origin_lat,
                    start_lon=req.origin_lon,
                    end_name=req.dest_name,
                    end_lat=req.dest_lat,
                    end_lon=req.dest_lon,
                    fare=bike_fare_est.fare_inr,
                    instructions=f"Take Rapido Bike Taxi from {req.origin_name} to {req.dest_name}",
                    line_color="#9333EA",  # Purple solid for Bike
                    start_dt=base_departure_dt,
                    vehicle_details={"vehicle_type": "Bike", "category": "Rapido Bike"},
                    custom_geom=(bike_dist_m, bike_dur_s, bike_poly, bike_coords)
                )
                generated_routes.append(self._assemble_route(
                    route_id=str(uuid.uuid4())[:8],
                    title="Direct Bike Taxi (Rapido Bike)",
                    route_name="BIKE",
                    category_tag="DIRECT_BIKE",
                    summary_badges=["Fastest in Traffic", "Solo Rider"],
                    legs=[bike_leg],
                    fare_estimate=bike_fare_est,
                    direct_cab_fare=benchmark_fare,
                    co2_saved_kg=round(cab_dist_km * 0.09, 2)
                ))

            # Auto (Regulated Official GNCTD Tariff)
            meter_fare, meter_details = transit_service.calculate_metered_auto_fare(cab_dist_km)
            auto_fare_est = FareEstimate(
                fare_inr=meter_fare,
                range_min=meter_fare,
                range_max=meter_fare,
                confidence="High",
                source=FareSource.ESTIMATED_FALLBACK,
                data_freshness_desc="Official GNCTD Auto Tariff",
                details=meter_details
            )
            govt_leg = self._build_leg(
                route_id=str(uuid.uuid4())[:8],
                seq=1,
                mode=ModeType.AUTO,
                provider="Delhi Govt",
                start_name=req.origin_name,
                start_lat=req.origin_lat,
                start_lon=req.origin_lon,
                end_name=req.dest_name,
                end_lat=req.dest_lat,
                end_lon=req.dest_lon,
                fare=meter_fare,
                instructions=f"Take Auto from {req.origin_name} to {req.dest_name}",
                line_color="#0D9488",  # Teal solid for Auto
                start_dt=base_departure_dt,
                vehicle_details={"vehicle_type": "Auto", "category": "Auto", "tariff_details": meter_details},
                custom_geom=(cab_dist_m, cab_dur_s * 1.15, cab_poly, cab_coords)
            )
            generated_routes.append(self._assemble_route(
                route_id=str(uuid.uuid4())[:8],
                title="Auto",
                route_name="AUTO",
                category_tag="DIRECT_AUTO",
                summary_badges=["Direct Route", "Regulated Tariff", "No Surge"],
                legs=[govt_leg],
                fare_estimate=auto_fare_est,
                direct_cab_fare=benchmark_fare,
                co2_saved_kg=round(cab_dist_km * 0.05, 2)
            ))

        # -------------------------------------------------------------
        # 3. Multimodal Routes (Metro, Bus, Hybrid First/Last Mile)
        # -------------------------------------------------------------
        if req.mode_preference in [TravelModeFilter.ALL, TravelModeFilter.PUBLIC_ONLY, TravelModeFilter.MIXED]:
            # Direct DTC AC City Bus Option with Delhi OTD Real-Time Bus Tracking
            bus_dist_m, bus_dur_s, bus_poly, bus_coords = get_leg_route_geometry(
                req.origin_lat, req.origin_lon, req.dest_lat, req.dest_lon, "BUS"
            )
            bus_km = round(bus_dist_m / 1000.0, 2)
            bus_fare, bus_desc = transit_service.calculate_dtc_bus_fare(
                db, bus_km, is_ac=True, qualifies_pink_pass=req.pink_pass
            )
            # Query Delhi OTD Real-Time Bus tracking for live buses near origin
            live_bus = otd_bus_service.get_nearest_live_bus_summary(req.origin_lat, req.origin_lon)
            bus_badges = ["DTC City Bus", "AC Low Floor"]
            if live_bus:
                bus_badges.append(f"🟢 Live: {live_bus['nearest_bus_reg']}")
                bus_badges.append(f"ETA {live_bus['eta_min']}m away")
            elif req.pink_pass:
                bus_badges.append("Pink Pass ₹0")
            else:
                bus_badges.append("Budget Choice")

            bus_veh_details: Dict[str, Any] = {"bus_type": "DTC AC Low-Floor", "fare_tier": bus_desc}
            if live_bus:
                bus_veh_details["live_tracking"] = True
                bus_veh_details["bus_registration"] = live_bus["nearest_bus_reg"]
                bus_veh_details["bus_route_id"] = live_bus["nearest_route_id"]
                bus_veh_details["live_distance_m"] = live_bus["distance_m"]
                bus_veh_details["live_eta_min"] = live_bus["eta_min"]
                bus_veh_details["active_buses_in_area"] = live_bus["active_buses_count"]
                bus_veh_details["data_source"] = live_bus["data_source"]

            bus_leg = self._build_leg(
                route_id=str(uuid.uuid4())[:8],
                seq=1,
                mode=ModeType.BUS,
                provider="DTC",
                start_name=req.origin_name,
                start_lat=req.origin_lat,
                start_lon=req.origin_lon,
                end_name=req.dest_name,
                end_lat=req.dest_lat,
                end_lon=req.dest_lon,
                fare=bus_fare,
                instructions=f"Take DTC AC City Bus from {req.origin_name} to {req.dest_name}" + (f" (Live Bus {live_bus['nearest_bus_reg']} ~{live_bus['eta_min']}m away)" if live_bus else ""),
                line_color="#DC2626",  # Red solid for Bus
                start_dt=base_departure_dt,
                vehicle_details=bus_veh_details,
                custom_geom=(bus_dist_m, bus_dur_s * 1.25, bus_poly, bus_coords)
            )

            bus_freshness = "Delhi OTD Live GPS Feed (Real-Time)" if live_bus else f"{bus_desc} (GNCTD Gazette)"
            generated_routes.append(self._assemble_route(
                route_id=str(uuid.uuid4())[:8],
                title="DTC AC City Bus",
                route_name="DTC BUS",
                category_tag="DTC_BUS",
                summary_badges=bus_badges,
                legs=[bus_leg],
                fare_estimate=FareEstimate(
                    fare_inr=bus_fare,
                    range_min=bus_fare,
                    range_max=bus_fare,
                    confidence="High",
                    source=FareSource.ESTIMATED_FALLBACK,
                    data_freshness_desc=bus_freshness
                ),
                direct_cab_fare=benchmark_fare,
                co2_saved_kg=round(bus_km * 0.12, 2)
            ))

            # DTC Bus with Interchange Option (Bus Transfer Hub)
            bus_interchange_res = transit_service.find_best_bus_interchange(
                db, req.origin_lat, req.origin_lon, req.dest_lat, req.dest_lon
            )
            if bus_interchange_res:
                interchange_stop, dist_leg1_km, dist_leg2_km = bus_interchange_res

                # Leg 1: Origin to Interchange Stop
                leg1_m, leg1_s, leg1_poly, leg1_coords = get_leg_route_geometry(
                    req.origin_lat, req.origin_lon, interchange_stop.latitude, interchange_stop.longitude, "BUS"
                )
                leg1_km = round(leg1_m / 1000.0, 2)
                leg1_fare, leg1_desc = transit_service.calculate_dtc_bus_fare(
                    db, leg1_km, is_ac=True, qualifies_pink_pass=req.pink_pass
                )

                # Leg 2: Interchange Stop to Destination
                leg2_m, leg2_s, leg2_poly, leg2_coords = get_leg_route_geometry(
                    interchange_stop.latitude, interchange_stop.longitude, req.dest_lat, req.dest_lon, "BUS"
                )
                leg2_km = round(leg2_m / 1000.0, 2)
                leg2_fare, leg2_desc = transit_service.calculate_dtc_bus_fare(
                    db, leg2_km, is_ac=True, qualifies_pink_pass=req.pink_pass
                )

                # Parse routes serviced at interchange terminal
                routes_list = [r.strip() for r in (interchange_stop.routes_serviced or "505, 522").split(",") if r.strip()]
                route_in = routes_list[0] if len(routes_list) > 0 else "505"
                route_out = routes_list[1] if len(routes_list) > 1 else (routes_list[0] if len(routes_list) > 0 else "522")

                t0 = base_departure_dt
                l1 = self._build_leg(
                    route_id=str(uuid.uuid4())[:8],
                    seq=1,
                    mode=ModeType.BUS,
                    provider="DTC",
                    start_name=req.origin_name,
                    start_lat=req.origin_lat,
                    start_lon=req.origin_lon,
                    end_name=interchange_stop.name,
                    end_lat=interchange_stop.latitude,
                    end_lon=interchange_stop.longitude,
                    fare=leg1_fare,
                    instructions=f"Board DTC Bus (Route {route_in}) from {req.origin_name} to {interchange_stop.name}",
                    line_color="#DC2626",
                    start_dt=t0,
                    vehicle_details={
                        "bus_type": "DTC AC Low-Floor",
                        "bus_route": f"Route {route_in}",
                        "interchange_terminal": interchange_stop.name,
                        "fare_tier": leg1_desc
                    },
                    custom_geom=(leg1_m, leg1_s * 1.25, leg1_poly, leg1_coords)
                )

                # 6-minute transfer buffer at interchange
                t1 = t0 + timedelta(seconds=leg1_s * 1.25)
                transfer_buffer_s = 360
                t2 = t1 + timedelta(seconds=transfer_buffer_s)

                l2 = self._build_leg(
                    route_id=str(uuid.uuid4())[:8],
                    seq=2,
                    mode=ModeType.BUS,
                    provider="DTC",
                    start_name=interchange_stop.name,
                    start_lat=interchange_stop.latitude,
                    start_lon=interchange_stop.longitude,
                    end_name=req.dest_name,
                    end_lat=req.dest_lat,
                    end_lon=req.dest_lon,
                    fare=leg2_fare,
                    instructions=f"Interchange at {interchange_stop.name}: Switch to connecting DTC Bus (Route {route_out}) to {req.dest_name}",
                    line_color="#B91C1C",
                    start_dt=t2,
                    vehicle_details={
                        "bus_type": "DTC AC Low-Floor",
                        "bus_route": f"Route {route_out}",
                        "transfer_hub": interchange_stop.name,
                        "fare_tier": leg2_desc
                    },
                    custom_geom=(leg2_m, leg2_s * 1.25, leg2_poly, leg2_coords)
                )

                total_bus_fare = round(leg1_fare + leg2_fare, 1)
                term_short_name = interchange_stop.name.split("/")[0].strip()

                int_badges = ["DTC Bus Interchange", f"Via {term_short_name}", "1 Bus Transfer"]
                if req.pink_pass:
                    int_badges.append("Pink Pass ₹0")
                else:
                    int_badges.append(f"Total ₹{int(total_bus_fare)}")

                freshness = f"DTC Official Gazette (₹{int(leg1_fare)} + ₹{int(leg2_fare)})"

                generated_routes.append(self._assemble_route(
                    route_id=str(uuid.uuid4())[:8],
                    title=f"DTC Bus (Interchange at {term_short_name})",
                    route_name="BUS + BUS",
                    category_tag="DTC_BUS",
                    summary_badges=int_badges,
                    legs=[l1, l2],
                    fare_estimate=FareEstimate(
                        fare_inr=total_bus_fare,
                        range_min=total_bus_fare,
                        range_max=total_bus_fare,
                        confidence="High",
                        source=FareSource.ESTIMATED_FALLBACK,
                        data_freshness_desc=freshness
                    ),
                    direct_cab_fare=benchmark_fare,
                    co2_saved_kg=round((leg1_km + leg2_km) * 0.12, 2)
                ))

            origin_stations = transit_service.find_nearest_stations(db, req.origin_lat, req.origin_lon, max_radius_km=7.5, limit=3)
            dest_stations = transit_service.find_nearest_stations(db, req.dest_lat, req.dest_lon, max_radius_km=7.5, limit=3)

            # -------------------------------------------------------------
            # Feature: Ola Maps Distance Matrix API
            # Batch computes travel times & road distances across all candidate
            # transfer hubs in one API call to identify the optimal combination.
            # -------------------------------------------------------------
            first_mile_dests = [(s.latitude, s.longitude) for s, _ in origin_stations]
            last_mile_origins = [(s.latitude, s.longitude) for s, _ in dest_stations]
            if first_mile_dests:
                prefetch_ola_distance_matrix([(req.origin_lat, req.origin_lon)], first_mile_dests, "AUTO")
                prefetch_ola_distance_matrix([(req.origin_lat, req.origin_lon)], first_mile_dests, "WALK")
            if last_mile_origins:
                prefetch_ola_distance_matrix(last_mile_origins, [(req.dest_lat, req.dest_lon)], "AUTO")
                prefetch_ola_distance_matrix(last_mile_origins, [(req.dest_lat, req.dest_lon)], "WALK")

            for o_stat, o_dist in origin_stations:
                for d_stat, d_dist in dest_stations:
                    if o_stat.id == d_stat.id:
                        continue

                    metro_journey = transit_service.plan_metro_journey(
                        db=db,
                        start_station=o_stat,
                        end_station=d_stat,
                        has_smart_card=req.has_smart_card,
                        is_off_peak=False
                    )

                    if not metro_journey:
                        continue

                    metro_dist_m = metro_journey["distance_km"] * 1000.0
                    metro_dur_s = metro_journey["duration_min"] * 60.0
                    metro_poly = encode_polyline(metro_journey["path_coords"])

                    # -------------------------------------------------------------
                    # SCENARIO 1: Walk + DMRC Metro + Walk
                    # (Acceptance Test 1: Both walking legs, metro leg, correct stats)
                    # -------------------------------------------------------------
                    if o_dist <= 2.2 and d_dist <= 2.2:
                        w1_m, w1_s, w1_poly, w1_coords = get_leg_route_geometry(
                            req.origin_lat, req.origin_lon, o_stat.latitude, o_stat.longitude, "WALK"
                        )
                        w2_m, w2_s, w2_poly, w2_coords = get_leg_route_geometry(
                            d_stat.latitude, d_stat.longitude, req.dest_lat, req.dest_lon, "WALK"
                        )

                        t0 = base_departure_dt
                        leg1 = self._build_leg(
                            route_id=str(uuid.uuid4())[:8],
                            seq=1,
                            mode=ModeType.WALK,
                            provider="Walking",
                            start_name=req.origin_name,
                            start_lat=req.origin_lat,
                            start_lon=req.origin_lon,
                            end_name=f"{o_stat.name} Metro Station",
                            end_lat=o_stat.latitude,
                            end_lon=o_stat.longitude,
                            fare=0.0,
                            instructions=f"Walk {int(w1_m)}m to {o_stat.name} Metro Station",
                            line_color="#EA580C",  # Orange dashed for Walking
                            start_dt=t0,
                            vehicle_details={"pedestrian_type": "Station Access Walk"},
                            custom_geom=(w1_m, w1_s, w1_poly, w1_coords)
                        )

                        t1 = t0 + timedelta(seconds=w1_s)
                        leg2 = self._build_leg(
                            route_id=str(uuid.uuid4())[:8],
                            seq=2,
                            mode=ModeType.METRO,
                            provider="DMRC",
                            start_name=f"{o_stat.name} Metro Station",
                            start_lat=o_stat.latitude,
                            start_lon=o_stat.longitude,
                            end_name=f"{d_stat.name} Metro Station",
                            end_lat=d_stat.latitude,
                            end_lon=d_stat.longitude,
                            fare=metro_journey["fare_inr"],
                            instructions=f"Board {o_stat.line_name} Line from {o_stat.name} to {d_stat.name} ({metro_journey['station_count']} stations, {metro_journey['interchanges']} line transfer)",
                            line_color="#2563EB",  # Blue solid for Metro
                            start_dt=t1,
                            vehicle_details={
                                "line_name": o_stat.line_name,
                                "line_color": o_stat.line_color,
                                "station_count": metro_journey["station_count"],
                                "interchanges": metro_journey["interchanges"],
                                "stations": [s.name for s in metro_journey.get("line_segments", [{}])[0].get("stations", [])] if metro_journey.get("line_segments") else []
                            },
                            custom_geom=(metro_dist_m, metro_dur_s, metro_poly, metro_journey["path_coords"])
                        )

                        t2 = t1 + timedelta(seconds=metro_dur_s)
                        leg3 = self._build_leg(
                            route_id=str(uuid.uuid4())[:8],
                            seq=3,
                            mode=ModeType.WALK,
                            provider="Walking",
                            start_name=f"{d_stat.name} Metro Station",
                            start_lat=d_stat.latitude,
                            start_lon=d_stat.longitude,
                            end_name=req.dest_name,
                            end_lat=req.dest_lat,
                            end_lon=req.dest_lon,
                            fare=0.0,
                            instructions=f"Walk {int(w2_m)}m from {d_stat.name} to {req.dest_name}",
                            line_color="#EA580C",  # Orange dashed for Walking
                            start_dt=t2,
                            vehicle_details={"pedestrian_type": "Destination Egress Walk"},
                            custom_geom=(w2_m, w2_s, w2_poly, w2_coords)
                        )

                        metro_est = FareEstimate(
                            fare_inr=metro_journey["fare_inr"],
                            range_min=metro_journey["fare_inr"],
                            range_max=metro_journey["fare_inr"],
                            confidence="High",
                            source=FareSource.ESTIMATED_FALLBACK,
                            data_freshness_desc=metro_journey["fare_desc"]
                        )

                        generated_routes.append(self._assemble_route(
                            route_id=str(uuid.uuid4())[:8],
                            title="Walk + DMRC Metro + Walk",
                            route_name="WALK + METRO + WALK",
                            category_tag="CHEAPEST",
                            summary_badges=["100% Eco-Friendly", "Maximum Savings", f"Only ₹{int(metro_journey['fare_inr'])}"],
                            legs=[leg1, leg2, leg3],
                            fare_estimate=metro_est,
                            direct_cab_fare=benchmark_fare,
                            co2_saved_kg=round(cab_dist_km * 0.14, 2)
                        ))

                    # -------------------------------------------------------------
                    # SCENARIO 2: Auto + DMRC Metro + Walk
                    # (Acceptance Test 3: Auto road + Metro + Walk, correct fare & walk)
                    # -------------------------------------------------------------
                    if d_dist <= 2.0:
                        a_dist_m, a_dur_s, a_poly, a_coords = get_leg_route_geometry(
                            req.origin_lat, req.origin_lon, o_stat.latitude, o_stat.longitude, "AUTO"
                        )
                        auto_dist_km = round(a_dist_m / 1000.0, 2)
                        auto_dur_min = round(a_dur_s / 60.0, 1)

                        fm_fare_est = pricing_service.get_ride_fare_estimate(
                            db, "rapido", "rapido_auto", auto_dist_km, auto_dur_min,
                            req.origin_lat, req.origin_lon, o_stat.latitude, o_stat.longitude
                        )

                        w2_m, w2_s, w2_poly, w2_coords = get_leg_route_geometry(
                            d_stat.latitude, d_stat.longitude, req.dest_lat, req.dest_lon, "WALK"
                        )

                        t0 = base_departure_dt
                        leg1 = self._build_leg(
                            route_id=str(uuid.uuid4())[:8],
                            seq=1,
                            mode=ModeType.AUTO,
                            provider="Rapido",
                            start_name=req.origin_name,
                            start_lat=req.origin_lat,
                            start_lon=req.origin_lon,
                            end_name=f"{o_stat.name} Metro Station",
                            end_lat=o_stat.latitude,
                            end_lon=o_stat.longitude,
                            fare=fm_fare_est.fare_inr,
                            instructions=f"Take Rapido Auto to {o_stat.name} Metro Station ({auto_dist_km} km)",
                            line_color="#0D9488",  # Teal solid for Auto
                            start_dt=t0,
                            vehicle_details={"vehicle_type": "Auto", "category": "Rapido Auto"},
                            custom_geom=(a_dist_m, a_dur_s, a_poly, a_coords)
                        )

                        t1 = t0 + timedelta(seconds=a_dur_s)
                        leg2 = self._build_leg(
                            route_id=str(uuid.uuid4())[:8],
                            seq=2,
                            mode=ModeType.METRO,
                            provider="DMRC",
                            start_name=f"{o_stat.name} Metro Station",
                            start_lat=o_stat.latitude,
                            start_lon=o_stat.longitude,
                            end_name=f"{d_stat.name} Metro Station",
                            end_lat=d_stat.latitude,
                            end_lon=d_stat.longitude,
                            fare=metro_journey["fare_inr"],
                            instructions=f"Board Metro from {o_stat.name} to {d_stat.name} ({metro_journey['station_count']} stops)",
                            line_color="#2563EB",  # Blue solid for Metro
                            start_dt=t1,
                            vehicle_details={
                                "line_name": o_stat.line_name,
                                "station_count": metro_journey["station_count"],
                                "interchanges": metro_journey["interchanges"]
                            },
                            custom_geom=(metro_dist_m, metro_dur_s, metro_poly, metro_journey["path_coords"])
                        )

                        t2 = t1 + timedelta(seconds=metro_dur_s)
                        leg3 = self._build_leg(
                            route_id=str(uuid.uuid4())[:8],
                            seq=3,
                            mode=ModeType.WALK,
                            provider="Walking",
                            start_name=f"{d_stat.name} Metro Station",
                            start_lat=d_stat.latitude,
                            start_lon=d_stat.longitude,
                            end_name=req.dest_name,
                            end_lat=req.dest_lat,
                            end_lon=req.dest_lon,
                            fare=0.0,
                            instructions=f"Walk {int(w2_m)}m to {req.dest_name}",
                            line_color="#EA580C",  # Orange dashed for Walking
                            start_dt=t2,
                            vehicle_details={"pedestrian_type": "Destination Egress Walk"},
                            custom_geom=(w2_m, w2_s, w2_poly, w2_coords)
                        )

                        combo_est = FareEstimate(
                            fare_inr=fm_fare_est.fare_inr + metro_journey["fare_inr"],
                            range_min=fm_fare_est.range_min + metro_journey["fare_inr"],
                            range_max=fm_fare_est.range_max + metro_journey["fare_inr"],
                            confidence="High",
                            source=FareSource.ML_PREDICTED,
                            data_freshness_desc="Rapido Auto ML + DMRC Ground Truth"
                        )

                        generated_routes.append(self._assemble_route(
                            route_id=str(uuid.uuid4())[:8],
                            title=f"Auto → Metro ({o_stat.name}) → Walk",
                            route_name="AUTO + METRO + WALK",
                            category_tag="BEST_OVERALL",
                            summary_badges=["Smart Multimodal", "Avoid Highway Jams"],
                            legs=[leg1, leg2, leg3],
                            fare_estimate=combo_est,
                            direct_cab_fare=benchmark_fare,
                            co2_saved_kg=round(cab_dist_km * 0.11, 2)
                        ))

                    # -------------------------------------------------------------
                    # SCENARIO 3: Walk + Metro + Last-Mile Auto/Cab
                    # -------------------------------------------------------------
                    if o_dist <= 1.5:
                        w1_m, w1_s, w1_poly, w1_coords = get_leg_route_geometry(
                            req.origin_lat, req.origin_lon, o_stat.latitude, o_stat.longitude, "WALK"
                        )
                        lm_dist_m, lm_dur_s, lm_poly, lm_coords = get_leg_route_geometry(
                            d_stat.latitude, d_stat.longitude, req.dest_lat, req.dest_lon, "AUTO"
                        )
                        lm_dist_km = round(lm_dist_m / 1000.0, 2)
                        lm_dur_min = round(lm_dur_s / 60.0, 1)

                        lm_fare_est = pricing_service.get_ride_fare_estimate(
                            db, "rapido", "rapido_auto", lm_dist_km, lm_dur_min,
                            d_stat.latitude, d_stat.longitude, req.dest_lat, req.dest_lon
                        )

                        t0 = base_departure_dt
                        leg1 = self._build_leg(
                            route_id=str(uuid.uuid4())[:8],
                            seq=1,
                            mode=ModeType.WALK,
                            provider="Walking",
                            start_name=req.origin_name,
                            start_lat=req.origin_lat,
                            start_lon=req.origin_lon,
                            end_name=f"{o_stat.name} Metro Station",
                            end_lat=o_stat.latitude,
                            end_lon=o_stat.longitude,
                            fare=0.0,
                            instructions=f"Walk {int(w1_m)}m to {o_stat.name} Metro Station",
                            line_color="#EA580C",
                            start_dt=t0,
                            vehicle_details={"pedestrian_type": "Origin Access Walk"},
                            custom_geom=(w1_m, w1_s, w1_poly, w1_coords)
                        )

                        t1 = t0 + timedelta(seconds=w1_s)
                        leg2 = self._build_leg(
                            route_id=str(uuid.uuid4())[:8],
                            seq=2,
                            mode=ModeType.METRO,
                            provider="DMRC",
                            start_name=f"{o_stat.name} Metro Station",
                            start_lat=o_stat.latitude,
                            start_lon=o_stat.longitude,
                            end_name=f"{d_stat.name} Metro Station",
                            end_lat=d_stat.latitude,
                            end_lon=d_stat.longitude,
                            fare=metro_journey["fare_inr"],
                            instructions=f"Ride {o_stat.line_name} Line from {o_stat.name} to {d_stat.name}",
                            line_color="#2563EB",
                            start_dt=t1,
                            vehicle_details={"line_name": o_stat.line_name, "station_count": metro_journey["station_count"]},
                            custom_geom=(metro_dist_m, metro_dur_s, metro_poly, metro_journey["path_coords"])
                        )

                        t2 = t1 + timedelta(seconds=metro_dur_s)
                        leg3 = self._build_leg(
                            route_id=str(uuid.uuid4())[:8],
                            seq=3,
                            mode=ModeType.AUTO,
                            provider="Rapido",
                            start_name=f"{d_stat.name} Metro Station",
                            start_lat=d_stat.latitude,
                            start_lon=d_stat.longitude,
                            end_name=req.dest_name,
                            end_lat=req.dest_lat,
                            end_lon=req.dest_lon,
                            fare=lm_fare_est.fare_inr,
                            instructions=f"Take Rapido Auto from {d_stat.name} to {req.dest_name}",
                            line_color="#0D9488",
                            start_dt=t2,
                            vehicle_details={"vehicle_type": "Auto"},
                            custom_geom=(lm_dist_m, lm_dur_s, lm_poly, lm_coords)
                        )

                        generated_routes.append(self._assemble_route(
                            route_id=str(uuid.uuid4())[:8],
                            title=f"Walk + Metro + Auto ({d_stat.name})",
                            route_name="WALK + METRO + AUTO",
                            category_tag="MOST_COMFORTABLE",
                            summary_badges=["High Comfort", "Drop-Off at Door"],
                            legs=[leg1, leg2, leg3],
                            fare_estimate=FareEstimate(
                                fare_inr=metro_journey["fare_inr"] + lm_fare_est.fare_inr,
                                range_min=metro_journey["fare_inr"] + lm_fare_est.range_min,
                                range_max=metro_journey["fare_inr"] + lm_fare_est.range_max,
                                confidence="High",
                                source=FareSource.ML_PREDICTED,
                                data_freshness_desc="DMRC + Rapido Auto"
                            ),
                            direct_cab_fare=benchmark_fare,
                            co2_saved_kg=round(cab_dist_km * 0.10, 2)
                        ))

            # -------------------------------------------------------------
            # SCENARIO 5: Walk + Bus + Metro + Walk (Acceptance Test 4)
            # -------------------------------------------------------------
            bus_stops_orig = transit_service.find_nearest_bus_stops(db, req.origin_lat, req.origin_lon, max_radius_km=3.0)
            if bus_stops_orig and origin_stations:
                b_orig, b_dist = bus_stops_orig[0]
                interchange_stat, _ = origin_stations[0]

                # Leg 1: Walk to bus stop
                w_b1_m, w_b1_s, w_b1_poly, w_b1_coords = get_leg_route_geometry(
                    req.origin_lat, req.origin_lon, b_orig.latitude, b_orig.longitude, "WALK"
                )
                # Leg 2: Bus from bus stop to metro station
                bus_m, bus_s, bus_poly, bus_coords = get_leg_route_geometry(
                    b_orig.latitude, b_orig.longitude, interchange_stat.latitude, interchange_stat.longitude, "BUS"
                )
                bus_fare, bus_desc = transit_service.calculate_dtc_bus_fare(
                    db, bus_m / 1000.0, is_ac=True, qualifies_pink_pass=req.pink_pass
                )

                # Metro from interchange station to destination station
                if dest_stations:
                    d_stat_bus, _ = dest_stations[0]
                    metro_bus_journey = transit_service.plan_metro_journey(
                        db, interchange_stat, d_stat_bus, has_smart_card=req.has_smart_card
                    )
                    if metro_bus_journey:
                        mb_dist_m = metro_bus_journey["distance_km"] * 1000.0
                        mb_dur_s = metro_bus_journey["duration_min"] * 60.0
                        mb_poly = encode_polyline(metro_bus_journey["path_coords"])

                        w_b2_m, w_b2_s, w_b2_poly, w_b2_coords = get_leg_route_geometry(
                            d_stat_bus.latitude, d_stat_bus.longitude, req.dest_lat, req.dest_lon, "WALK"
                        )

                        t0 = base_departure_dt
                        l1 = self._build_leg(
                            route_id=str(uuid.uuid4())[:8], seq=1, mode=ModeType.WALK, provider="Walking",
                            start_name=req.origin_name, start_lat=req.origin_lat, start_lon=req.origin_lon,
                            end_name=b_orig.name, end_lat=b_orig.latitude, end_lon=b_orig.longitude,
                            fare=0.0, instructions=f"Walk {int(w_b1_m)}m to {b_orig.name}",
                            line_color="#EA580C", start_dt=t0,
                            custom_geom=(w_b1_m, w_b1_s, w_b1_poly, w_b1_coords)
                        )
                        t1 = t0 + timedelta(seconds=w_b1_s)
                        l2 = self._build_leg(
                            route_id=str(uuid.uuid4())[:8], seq=2, mode=ModeType.BUS, provider="DTC",
                            start_name=b_orig.name, start_lat=b_orig.latitude, start_lon=b_orig.longitude,
                            end_name=f"{interchange_stat.name} Metro Station", end_lat=interchange_stat.latitude, end_lon=interchange_stat.longitude,
                            fare=bus_fare, instructions=f"Board DTC AC Bus from {b_orig.name} to {interchange_stat.name} Metro Station",
                            line_color="#DC2626", start_dt=t1,  # Red solid for Bus
                            vehicle_details={"bus_route": b_orig.routes_serviced.split(",")[0].strip()},
                            custom_geom=(bus_m, bus_s, bus_poly, bus_coords)
                        )
                        t2 = t1 + timedelta(seconds=bus_s)
                        l3 = self._build_leg(
                            route_id=str(uuid.uuid4())[:8], seq=3, mode=ModeType.METRO, provider="DMRC",
                            start_name=f"{interchange_stat.name} Metro Station", start_lat=interchange_stat.latitude, start_lon=interchange_stat.longitude,
                            end_name=f"{d_stat_bus.name} Metro Station", end_lat=d_stat_bus.latitude, end_lon=d_stat_bus.longitude,
                            fare=metro_bus_journey["fare_inr"], instructions=f"Board Metro from {interchange_stat.name} to {d_stat_bus.name}",
                            line_color="#2563EB", start_dt=t2,  # Blue solid for Metro
                            vehicle_details={"line_name": interchange_stat.line_name, "station_count": metro_bus_journey["station_count"]},
                            custom_geom=(mb_dist_m, mb_dur_s, mb_poly, metro_bus_journey["path_coords"])
                        )
                        t3 = t2 + timedelta(seconds=mb_dur_s)
                        l4 = self._build_leg(
                            route_id=str(uuid.uuid4())[:8], seq=4, mode=ModeType.WALK, provider="Walking",
                            start_name=f"{d_stat_bus.name} Metro Station", start_lat=d_stat_bus.latitude, start_lon=d_stat_bus.longitude,
                            end_name=req.dest_name, end_lat=req.dest_lat, end_lon=req.dest_lon,
                            fare=0.0, instructions=f"Walk {int(w_b2_m)}m to {req.dest_name}",
                            line_color="#EA580C", start_dt=t3,  # Orange dashed for Walking
                            custom_geom=(w_b2_m, w_b2_s, w_b2_poly, w_b2_coords)
                        )

                        generated_routes.append(self._assemble_route(
                            route_id=str(uuid.uuid4())[:8],
                            title="Walk + DTC Bus + Metro + Walk",
                            route_name="WALK + BUS + METRO + WALK",
                            category_tag="DTC_BUS",
                            summary_badges=["Bus + Metro Integration", f"Fare: ₹{int(bus_fare + metro_bus_journey['fare_inr'])}"],
                            legs=[l1, l2, l3, l4],
                            fare_estimate=FareEstimate(
                                fare_inr=bus_fare + metro_bus_journey["fare_inr"],
                                range_min=bus_fare + metro_bus_journey["fare_inr"],
                                range_max=bus_fare + metro_bus_journey["fare_inr"],
                                confidence="High",
                                source=FareSource.ESTIMATED_FALLBACK,
                                data_freshness_desc=f"{bus_desc} + DMRC Fare"
                            ),
                            direct_cab_fare=benchmark_fare,
                            co2_saved_kg=round(cab_dist_km * 0.15, 2)
                        ))

        # -------------------------------------------------------------
        # 4. Mandatory Constraint Filtering
        # -------------------------------------------------------------
        valid_routes = []
        for r in generated_routes:
            # Check maximum walking distance: limit individual walk legs to max_walking + 400m,
            # and total trip walking across multiple legs to max_walking * 1.6 + 200m
            walk_legs = [l for l in r.legs if l.mode == ModeType.WALK]
            if any(l.distance_meters > (req.max_walking_meters + 500) for l in walk_legs):
                continue
            max_allowed_walk = (req.max_walking_meters * 1.6 + 200) if len(walk_legs) >= 2 else (req.max_walking_meters + 200)
            if r.walking_distance_meters > max_allowed_walk:
                continue
            # Check maximum trip budget
            if req.max_budget_inr and r.total_estimated_fare > req.max_budget_inr:
                continue
            # Check wheelchair accessibility
            if req.wheelchair_accessible:
                has_inaccessible = any(l.mode == ModeType.BIKE for l in r.legs)
                if has_inaccessible:
                    continue
            valid_routes.append(r)

        if not valid_routes:
            valid_routes = generated_routes

        # -------------------------------------------------------------
        # 5. Multi-Criteria Scoring & Personalized Ranking
        # -------------------------------------------------------------
        ranked_routes = self._score_routes(valid_routes, req.priority)

        # Assign Category Badges
        if ranked_routes:
            fastest_idx = min(range(len(ranked_routes)), key=lambda i: ranked_routes[i].total_journey_duration_min)
            cheapest_idx = min(range(len(ranked_routes)), key=lambda i: ranked_routes[i].total_estimated_fare)
            least_walk_idx = min(range(len(ranked_routes)), key=lambda i: ranked_routes[i].walking_distance_meters)
            least_trans_idx = min(range(len(ranked_routes)), key=lambda i: ranked_routes[i].transfer_count)

            ranked_routes[fastest_idx].category_tag = "FASTEST"
            ranked_routes[cheapest_idx].category_tag = "CHEAPEST"
            ranked_routes[least_walk_idx].category_tag = "LEAST_WALKING"
            ranked_routes[least_trans_idx].category_tag = "LEAST_TRANSFERS"
            ranked_routes[0].category_tag = "BEST_OVERALL"
            ranked_routes[0].is_recommended = True

        comp_time = (datetime.now() - start_time).total_seconds() * 1000.0

        return SearchResponse(
            query=req,
            direct_cab_benchmark=direct_cab_benchmark,
            routes=ranked_routes,
            total_options_analyzed=len(generated_routes),
            computation_time_ms=round(comp_time, 1)
        )

    def _score_routes(self, routes: List[RouteOption], priority: RoutePriority) -> List[RouteOption]:
        if not routes:
            return []

        min_cost = min(r.total_estimated_fare for r in routes) or 1.0
        max_cost = max(r.total_estimated_fare for r in routes) or 1.0
        min_time = min(r.total_journey_duration_min for r in routes) or 1.0
        max_time = max(r.total_journey_duration_min for r in routes) or 1.0
        min_walk = min(r.walking_distance_meters for r in routes) or 1.0
        max_walk = max(r.walking_distance_meters for r in routes) or 1.0

        if priority == RoutePriority.FASTEST:
            w_cost, w_time, w_walk, w_trans = 0.15, 0.70, 0.10, 0.05
        elif priority == RoutePriority.CHEAPEST:
            w_cost, w_time, w_walk, w_trans = 0.75, 0.15, 0.05, 0.05
        elif priority == RoutePriority.MOST_COMFORTABLE:
            w_cost, w_time, w_walk, w_trans = 0.10, 0.20, 0.40, 0.30
        elif priority == RoutePriority.LEAST_WALKING:
            w_cost, w_time, w_walk, w_trans = 0.10, 0.15, 0.65, 0.10
        elif priority == RoutePriority.LEAST_TRANSFERS:
            w_cost, w_time, w_walk, w_trans = 0.15, 0.20, 0.15, 0.50
        elif priority == RoutePriority.ECO_FRIENDLY:
            w_cost, w_time, w_walk, w_trans = 0.30, 0.20, 0.10, 0.40
        else:
            w_cost, w_time, w_walk, w_trans = 0.40, 0.35, 0.15, 0.10

        for r in routes:
            norm_cost = (r.total_estimated_fare - min_cost) / (max_cost - min_cost + 1e-5)
            norm_time = (r.total_journey_duration_min - min_time) / (max_time - min_time + 1e-5)
            norm_walk = (r.walking_distance_meters - min_walk) / (max_walk - min_walk + 1e-5)
            norm_trans = min(1.0, r.transfer_count / 3.0)

            score = (w_cost * norm_cost) + (w_time * norm_time) + (w_walk * norm_walk) + (w_trans * norm_trans)
            r.score = round(score * 100.0, 2)

        return sorted(routes, key=lambda x: x.score)

routing_service = RoutingService()
