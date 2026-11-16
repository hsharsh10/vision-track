import os
from sqlalchemy.orm import Session
from backend.app.db.database import engine, Base, SessionLocal
from backend.app.models.models import (
    TransitStation, BusStop, TransitFareRule,
    MobilityProvider, ProviderVehicleCategory, FareObservation, UserPreference
)
import random
from datetime import datetime, timedelta

# Detailed Delhi NCR Stations dataset
DELHI_METRO_STATIONS = [
    # Yellow Line
    {"name": "Samaypur Badli", "line": "Yellow", "color": "#FACC15", "lat": 28.7454, "lon": 77.1352, "order": 1, "interchange": False, "interchange_lines": ""},
    {"name": "Azadpur", "line": "Yellow", "color": "#FACC15", "lat": 28.7071, "lon": 77.1788, "order": 2, "interchange": True, "interchange_lines": "Pink"},
    {"name": "Kashmere Gate", "line": "Yellow", "color": "#FACC15", "lat": 28.6675, "lon": 77.2285, "order": 3, "interchange": True, "interchange_lines": "Red,Violet"},
    {"name": "Chandni Chowk", "line": "Yellow", "color": "#FACC15", "lat": 28.6578, "lon": 77.2301, "order": 4, "interchange": False, "interchange_lines": ""},
    {"name": "New Delhi", "line": "Yellow", "color": "#FACC15", "lat": 28.6431, "lon": 77.2223, "order": 5, "interchange": True, "interchange_lines": "Airport Express"},
    {"name": "Rajiv Chowk", "line": "Yellow", "color": "#FACC15", "lat": 28.6328, "lon": 77.2197, "order": 6, "interchange": True, "interchange_lines": "Blue"},
    {"name": "Patel Chowk", "line": "Yellow", "color": "#FACC15", "lat": 28.6231, "lon": 77.2139, "order": 7, "interchange": False, "interchange_lines": ""},
    {"name": "Central Secretariat", "line": "Yellow", "color": "#FACC15", "lat": 28.6146, "lon": 77.2119, "order": 8, "interchange": True, "interchange_lines": "Violet"},
    {"name": "Udyog Bhawan", "line": "Yellow", "color": "#FACC15", "lat": 28.6115, "lon": 77.2125, "order": 9, "interchange": False, "interchange_lines": ""},
    {"name": "Lok Kalyan Marg", "line": "Yellow", "color": "#FACC15", "lat": 28.5997, "lon": 77.2120, "order": 10, "interchange": False, "interchange_lines": ""},
    {"name": "Jor Bagh", "line": "Yellow", "color": "#FACC15", "lat": 28.5869, "lon": 77.2123, "order": 11, "interchange": False, "interchange_lines": ""},
    {"name": "Dilli Haat - INA", "line": "Yellow", "color": "#FACC15", "lat": 28.5744, "lon": 77.2098, "order": 12, "interchange": True, "interchange_lines": "Pink"},
    {"name": "AIIMS", "line": "Yellow", "color": "#FACC15", "lat": 28.5683, "lon": 77.2078, "order": 13, "interchange": False, "interchange_lines": ""},
    {"name": "Green Park", "line": "Yellow", "color": "#FACC15", "lat": 28.5588, "lon": 77.2065, "order": 14, "interchange": False, "interchange_lines": ""},
    {"name": "Hauz Khas", "line": "Yellow", "color": "#FACC15", "lat": 28.5431, "lon": 77.2064, "order": 15, "interchange": True, "interchange_lines": "Magenta"},
    {"name": "Malviya Nagar", "line": "Yellow", "color": "#FACC15", "lat": 28.5284, "lon": 77.2069, "order": 16, "interchange": False, "interchange_lines": ""},
    {"name": "Saket", "line": "Yellow", "color": "#FACC15", "lat": 28.5204, "lon": 77.2016, "order": 17, "interchange": False, "interchange_lines": ""},
    {"name": "Qutab Minar", "line": "Yellow", "color": "#FACC15", "lat": 28.5029, "lon": 77.1861, "order": 18, "interchange": False, "interchange_lines": ""},
    {"name": "Chhatarpur", "line": "Yellow", "color": "#FACC15", "lat": 28.5061, "lon": 77.1742, "order": 19, "interchange": False, "interchange_lines": ""},
    {"name": "Sikanderpur", "line": "Yellow", "color": "#FACC15", "lat": 28.4820, "lon": 77.0932, "order": 20, "interchange": True, "interchange_lines": "Rapid Metro"},
    {"name": "MG Road Gurugram", "line": "Yellow", "color": "#FACC15", "lat": 28.4797, "lon": 77.0803, "order": 21, "interchange": False, "interchange_lines": ""},
    {"name": "IFFCO Chowk", "line": "Yellow", "color": "#FACC15", "lat": 28.4721, "lon": 77.0725, "order": 22, "interchange": False, "interchange_lines": ""},
    {"name": "Millennium City Centre", "line": "Yellow", "color": "#FACC15", "lat": 28.4593, "lon": 77.0726, "order": 23, "interchange": False, "interchange_lines": ""},

    # Blue Line (Main)
    {"name": "Dwarka Sector 21", "line": "Blue", "color": "#2563EB", "lat": 28.5522, "lon": 77.0583, "order": 1, "interchange": True, "interchange_lines": "Airport Express"},
    {"name": "Dwarka Mor", "line": "Blue", "color": "#2563EB", "lat": 28.6192, "lon": 77.0326, "order": 2, "interchange": False, "interchange_lines": ""},
    {"name": "Uttam Nagar East", "line": "Blue", "color": "#2563EB", "lat": 28.6253, "lon": 77.0652, "order": 3, "interchange": False, "interchange_lines": ""},
    {"name": "Janakpuri West", "line": "Blue", "color": "#2563EB", "lat": 28.6294, "lon": 77.0777, "order": 4, "interchange": True, "interchange_lines": "Magenta"},
    {"name": "Rajouri Garden", "line": "Blue", "color": "#2563EB", "lat": 28.6492, "lon": 77.1226, "order": 5, "interchange": True, "interchange_lines": "Pink"},
    {"name": "Kirti Nagar", "line": "Blue", "color": "#2563EB", "lat": 28.6558, "lon": 77.1511, "order": 6, "interchange": True, "interchange_lines": "Green"},
    {"name": "Karol Bagh", "line": "Blue", "color": "#2563EB", "lat": 28.6443, "lon": 77.1903, "order": 7, "interchange": False, "interchange_lines": ""},
    {"name": "RK Ashram Marg", "line": "Blue", "color": "#2563EB", "lat": 28.6392, "lon": 77.2091, "order": 8, "interchange": False, "interchange_lines": ""},
    {"name": "Rajiv Chowk (Blue)", "line": "Blue", "color": "#2563EB", "lat": 28.6328, "lon": 77.2197, "order": 9, "interchange": True, "interchange_lines": "Yellow"},
    {"name": "Barakhamba Road", "line": "Blue", "color": "#2563EB", "lat": 28.6307, "lon": 77.2274, "order": 10, "interchange": False, "interchange_lines": ""},
    {"name": "Mandi House", "line": "Blue", "color": "#2563EB", "lat": 28.6258, "lon": 77.2341, "order": 11, "interchange": True, "interchange_lines": "Violet"},
    {"name": "Supreme Court", "line": "Blue", "color": "#2563EB", "lat": 28.6209, "lon": 77.2428, "order": 12, "interchange": False, "interchange_lines": ""},
    {"name": "Yamuna Bank", "line": "Blue", "color": "#2563EB", "lat": 28.6241, "lon": 77.2638, "order": 13, "interchange": True, "interchange_lines": "Blue-Branch"},
    {"name": "Mayur Vihar-I", "line": "Blue", "color": "#2563EB", "lat": 28.6047, "lon": 77.2947, "order": 14, "interchange": True, "interchange_lines": "Pink"},
    {"name": "Akshardham", "line": "Blue", "color": "#2563EB", "lat": 28.6180, "lon": 77.2790, "order": 15, "interchange": False, "interchange_lines": ""},
    {"name": "Noida Sector 15", "line": "Blue", "color": "#2563EB", "lat": 28.5855, "lon": 77.3117, "order": 16, "interchange": False, "interchange_lines": ""},
    {"name": "Noida Sector 16", "line": "Blue", "color": "#2563EB", "lat": 28.5786, "lon": 77.3175, "order": 17, "interchange": False, "interchange_lines": ""},
    {"name": "Noida Sector 18", "line": "Blue", "color": "#2563EB", "lat": 28.5708, "lon": 77.3261, "order": 18, "interchange": False, "interchange_lines": ""},
    {"name": "Botanical Garden", "line": "Blue", "color": "#2563EB", "lat": 28.5641, "lon": 77.3342, "order": 19, "interchange": True, "interchange_lines": "Magenta"},
    {"name": "Noida City Centre", "line": "Blue", "color": "#2563EB", "lat": 28.5747, "lon": 77.3561, "order": 20, "interchange": False, "interchange_lines": ""},
    {"name": "Noida Sector 52", "line": "Blue", "color": "#2563EB", "lat": 28.5912, "lon": 77.3712, "order": 21, "interchange": True, "interchange_lines": "Aqua"},
    {"name": "Noida Electronic City", "line": "Blue", "color": "#2563EB", "lat": 28.6277, "lon": 77.3725, "order": 22, "interchange": False, "interchange_lines": ""},

    # Magenta Line
    {"name": "Janakpuri West (Magenta)", "line": "Magenta", "color": "#E11D48", "lat": 28.6294, "lon": 77.0777, "order": 1, "interchange": True, "interchange_lines": "Blue"},
    {"name": "Terminal 1 IGI Airport", "line": "Magenta", "color": "#E11D48", "lat": 28.5583, "lon": 77.1189, "order": 2, "interchange": False, "interchange_lines": ""},
    {"name": "Vasant Vihar", "line": "Magenta", "color": "#E11D48", "lat": 28.5611, "lon": 77.1583, "order": 3, "interchange": False, "interchange_lines": ""},
    {"name": "Munirka", "line": "Magenta", "color": "#E11D48", "lat": 28.5581, "lon": 77.1739, "order": 4, "interchange": False, "interchange_lines": ""},
    {"name": "IIT Delhi", "line": "Magenta", "color": "#E11D48", "lat": 28.5472, "lon": 77.1953, "order": 5, "interchange": False, "interchange_lines": ""},
    {"name": "Hauz Khas (Magenta)", "line": "Magenta", "color": "#E11D48", "lat": 28.5431, "lon": 77.2064, "order": 6, "interchange": True, "interchange_lines": "Yellow"},
    {"name": "Panchsheel Park", "line": "Magenta", "color": "#E11D48", "lat": 28.5433, "lon": 77.2181, "order": 7, "interchange": False, "interchange_lines": ""},
    {"name": "Greater Kailash", "line": "Magenta", "color": "#E11D48", "lat": 28.5422, "lon": 77.2344, "order": 8, "interchange": False, "interchange_lines": ""},
    {"name": "Nehru Enclave", "line": "Magenta", "color": "#E11D48", "lat": 28.5447, "lon": 77.2519, "order": 9, "interchange": False, "interchange_lines": ""},
    {"name": "Kalkaji Mandir", "line": "Magenta", "color": "#E11D48", "lat": 28.5494, "lon": 77.2606, "order": 10, "interchange": True, "interchange_lines": "Violet"},
    {"name": "Okhla Bird Sanctuary", "line": "Magenta", "color": "#E11D48", "lat": 28.5606, "lon": 77.3197, "order": 11, "interchange": False, "interchange_lines": ""},
    {"name": "Botanical Garden (Magenta)", "line": "Magenta", "color": "#E11D48", "lat": 28.5641, "lon": 77.3342, "order": 12, "interchange": True, "interchange_lines": "Blue"},

    # Airport Express Line
    {"name": "New Delhi (Airport Express)", "line": "Airport Express", "color": "#F97316", "lat": 28.6431, "lon": 77.2223, "order": 1, "interchange": True, "interchange_lines": "Yellow"},
    {"name": "Shivaji Stadium", "line": "Airport Express", "color": "#F97316", "lat": 28.6297, "lon": 77.2119, "order": 2, "interchange": False, "interchange_lines": ""},
    {"name": "Dhaula Kuan", "line": "Airport Express", "color": "#F97316", "lat": 28.5919, "lon": 77.1611, "order": 3, "interchange": True, "interchange_lines": "Pink"},
    {"name": "Delhi Aerocity", "line": "Airport Express", "color": "#F97316", "lat": 28.5489, "lon": 77.1219, "order": 4, "interchange": False, "interchange_lines": ""},
    {"name": "IGI Airport T-3", "line": "Airport Express", "color": "#F97316", "lat": 28.5562, "lon": 77.0858, "order": 5, "interchange": False, "interchange_lines": ""},
    {"name": "Dwarka Sector 21 (Exp)", "line": "Airport Express", "color": "#F97316", "lat": 28.5522, "lon": 77.0583, "order": 6, "interchange": True, "interchange_lines": "Blue"},
    {"name": "Yashobhoomi Dwarka Sector 25", "line": "Airport Express", "color": "#F97316", "lat": 28.5444, "lon": 77.0264, "order": 7, "interchange": False, "interchange_lines": ""},

    # Rapid Metro Gurugram
    {"name": "Sikanderpur (Rapid Metro)", "line": "Rapid Metro", "color": "#06B6D4", "lat": 28.4820, "lon": 77.0932, "order": 1, "interchange": True, "interchange_lines": "Yellow"},
    {"name": "DLF Phase 2", "line": "Rapid Metro", "color": "#06B6D4", "lat": 28.4897, "lon": 77.0886, "order": 2, "interchange": False, "interchange_lines": ""},
    {"name": "Cyber City (DLF Phase 3)", "line": "Rapid Metro", "color": "#06B6D4", "lat": 28.4967, "lon": 77.0903, "order": 3, "interchange": False, "interchange_lines": ""},
    {"name": "Moulsari Avenue", "line": "Rapid Metro", "color": "#06B6D4", "lat": 28.5028, "lon": 77.0939, "order": 4, "interchange": False, "interchange_lines": ""},
    {"name": "Sector 55-56 Gurugram", "line": "Rapid Metro", "color": "#06B6D4", "lat": 28.4231, "lon": 77.1064, "order": 5, "interchange": False, "interchange_lines": ""},

    # Pink Line (Key Ring Corridors)
    {"name": "Netaji Subhash Place", "line": "Pink", "color": "#EC4899", "lat": 28.6958, "lon": 77.1528, "order": 1, "interchange": True, "interchange_lines": "Red"},
    {"name": "Punjabi Bagh West", "line": "Pink", "color": "#EC4899", "lat": 28.6658, "lon": 77.1306, "order": 2, "interchange": True, "interchange_lines": "Green"},
    {"name": "Rajouri Garden (Pink)", "line": "Pink", "color": "#EC4899", "lat": 28.6492, "lon": 77.1226, "order": 3, "interchange": True, "interchange_lines": "Blue"},
    {"name": "South Campus (Dhaula Kuan)", "line": "Pink", "color": "#EC4899", "lat": 28.5881, "lon": 77.1633, "order": 4, "interchange": True, "interchange_lines": "Airport Express"},
    {"name": "Lajpat Nagar (Pink)", "line": "Pink", "color": "#EC4899", "lat": 28.5703, "lon": 77.2372, "order": 5, "interchange": True, "interchange_lines": "Violet"},
    {"name": "Anand Vihar ISBT", "line": "Pink", "color": "#EC4899", "lat": 28.6472, "lon": 77.3156, "order": 6, "interchange": True, "interchange_lines": "Blue"},
]

DTC_BUS_STOPS = [
    {"stop_id": "DTC_001", "name": "Connaught Place / Shivaji Stadium Terminal", "lat": 28.6298, "lon": 77.2118, "routes": "505, 522, 604, 725, 894", "is_terminal": True},
    {"stop_id": "DTC_002", "name": "Kashmere Gate ISBT", "lat": 28.6678, "lon": 77.2281, "routes": "100, 108, 205, 214, 901", "is_terminal": True},
    {"stop_id": "DTC_003", "name": "Anand Vihar ISBT", "lat": 28.6475, "lon": 77.3159, "routes": "73, 85, 340, 543, 85A", "is_terminal": True},
    {"stop_id": "DTC_004", "name": "Sarai Kale Khan ISBT", "lat": 28.5889, "lon": 77.2558, "routes": "311, 413, 507, 543A, 724", "is_terminal": True},
    {"stop_id": "DTC_005", "name": "AIIMS / Safdarjung Hospital", "lat": 28.5685, "lon": 77.2081, "routes": "433, 502, 505, 548, 623", "is_terminal": False},
    {"stop_id": "DTC_006", "name": "Dhaula Kuan Intersection", "lat": 28.5915, "lon": 77.1614, "routes": "711, 724, 729, 794, 883", "is_terminal": False},
    {"stop_id": "DTC_007", "name": "Nehru Place Bus Terminal", "lat": 28.5492, "lon": 77.2525, "routes": "425, 429, 534, 540, 724", "is_terminal": True},
    {"stop_id": "DTC_008", "name": "Lajpat Nagar Central Market", "lat": 28.5706, "lon": 77.2375, "routes": "419, 423, 433, 543, 724", "is_terminal": False},
    {"stop_id": "DTC_009", "name": "Cyber Hub / Shankar Chowk Gurgaon", "lat": 28.4981, "lon": 77.0894, "routes": "DTC-NCR-111, Gurugram Metropolitan Bus", "is_terminal": False},
    {"stop_id": "DTC_010", "name": "Noida Sector 37 Bus Stand", "lat": 28.5645, "lon": 77.3346, "routes": "34, 347, 392, 492", "is_terminal": True},
]

DMRC_FARE_RULES = [
    # DMRC Official Fare Structure
    {"system": "DMRC", "min_km": 0.0, "max_km": 2.0, "std": 11.0, "card": 9.90, "offpeak": 8.90},
    {"system": "DMRC", "min_km": 2.0, "max_km": 5.0, "std": 21.0, "card": 18.90, "offpeak": 17.00},
    {"system": "DMRC", "min_km": 5.0, "max_km": 12.0, "std": 32.0, "card": 28.80, "offpeak": 25.90},
    {"system": "DMRC", "min_km": 12.0, "max_km": 21.0, "std": 43.0, "card": 38.70, "offpeak": 34.80},
    {"system": "DMRC", "min_km": 21.0, "max_km": 32.0, "std": 54.0, "card": 48.60, "offpeak": 43.70},
    {"system": "DMRC", "min_km": 32.0, "max_km": 150.0, "std": 64.0, "card": 57.60, "offpeak": 51.80},

    # DTC Bus Slabs
    {"system": "DTC_NON_AC", "min_km": 0.0, "max_km": 4.0, "std": 5.0, "card": 5.0, "offpeak": 5.0},
    {"system": "DTC_NON_AC", "min_km": 4.0, "max_km": 10.0, "std": 10.0, "card": 10.0, "offpeak": 10.0},
    {"system": "DTC_NON_AC", "min_km": 10.0, "max_km": 100.0, "std": 15.0, "card": 15.0, "offpeak": 15.0},

    {"system": "DTC_AC", "min_km": 0.0, "max_km": 4.0, "std": 10.0, "card": 10.0, "offpeak": 10.0},
    {"system": "DTC_AC", "min_km": 4.0, "max_km": 8.0, "std": 15.0, "card": 15.0, "offpeak": 15.0},
    {"system": "DTC_AC", "min_km": 8.0, "max_km": 12.0, "std": 20.0, "card": 20.0, "offpeak": 20.0},
    {"system": "DTC_AC", "min_km": 12.0, "max_km": 100.0, "std": 25.0, "card": 25.0, "offpeak": 25.0},

    # Rapid Metro Flat Slabs
    {"system": "RAPID_METRO", "min_km": 0.0, "max_km": 100.0, "std": 20.0, "card": 18.0, "offpeak": 18.0},
]

MOBILITY_PROVIDERS = [
    {"code": "uber", "display": "Uber India", "is_metered": False},
    {"code": "ola", "display": "Ola Cabs", "is_metered": False},
    {"code": "rapido", "display": "Rapido", "is_metered": False},
    {"code": "delhi_govt", "display": "Delhi Govt Metered Auto", "is_metered": True},
]

PROVIDER_CATEGORIES = [
    # Uber
    {"provider": "uber", "code": "uber_go", "name": "Uber Go", "type": "cab", "base": 48.0, "base_dist": 1.0, "per_km": 14.8, "per_min": 1.6, "night_pct": 0.0, "wait": 1.5, "min_fare": 75.0},
    {"provider": "uber", "code": "uber_auto", "name": "Uber Auto", "type": "auto", "base": 32.0, "base_dist": 1.5, "per_km": 11.5, "per_min": 1.0, "night_pct": 25.0, "wait": 0.75, "min_fare": 35.0},
    {"provider": "uber", "code": "uber_moto", "name": "Uber Moto", "type": "bike", "base": 22.0, "base_dist": 1.0, "per_km": 7.5, "per_min": 0.8, "night_pct": 0.0, "wait": 0.5, "min_fare": 25.0},

    # Ola
    {"provider": "ola", "code": "ola_mini", "name": "Ola Mini", "type": "cab", "base": 50.0, "base_dist": 1.0, "per_km": 15.0, "per_min": 1.7, "night_pct": 0.0, "wait": 1.5, "min_fare": 80.0},
    {"provider": "ola", "code": "ola_auto", "name": "Ola Auto", "type": "auto", "base": 33.0, "base_dist": 1.5, "per_km": 11.4, "per_min": 1.0, "night_pct": 25.0, "wait": 0.75, "min_fare": 35.0},

    # Rapido
    {"provider": "rapido", "code": "rapido_bike", "name": "Rapido Bike", "type": "bike", "base": 20.0, "base_dist": 1.0, "per_km": 7.0, "per_min": 0.75, "night_pct": 0.0, "wait": 0.5, "min_fare": 25.0},
    {"provider": "rapido", "code": "rapido_auto", "name": "Rapido Auto", "type": "auto", "base": 30.0, "base_dist": 1.5, "per_km": 11.2, "per_min": 0.9, "night_pct": 25.0, "wait": 0.75, "min_fare": 35.0},
    {"provider": "rapido", "code": "rapido_cab", "name": "Rapido Cab", "type": "cab", "base": 46.0, "base_dist": 1.0, "per_km": 14.2, "per_min": 1.4, "night_pct": 0.0, "wait": 1.2, "min_fare": 70.0},

    # Govt Metered Auto
    {"provider": "delhi_govt", "code": "govt_metered_auto", "name": "Delhi Metered Auto", "type": "auto", "base": 30.0, "base_dist": 1.5, "per_km": 11.0, "per_min": 0.0, "night_pct": 25.0, "wait": 0.75, "min_fare": 30.0},
]

def seed_database():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        # 1. Seed Transit Stations
        if db.query(TransitStation).count() == 0:
            for s in DELHI_METRO_STATIONS:
                station = TransitStation(
                    name=s["name"],
                    line_name=s["line"],
                    line_color=s["color"],
                    latitude=s["lat"],
                    longitude=s["lon"],
                    sequence_order=s["order"],
                    is_interchange=s["interchange"],
                    interchange_lines=s["interchange_lines"]
                )
                db.add(station)
            print(f"Seeded {len(DELHI_METRO_STATIONS)} DMRC stations.")

        # 2. Seed Bus Stops
        if db.query(BusStop).count() == 0:
            for b in DTC_BUS_STOPS:
                stop = BusStop(
                    stop_id=b["stop_id"],
                    name=b["name"],
                    latitude=b["lat"],
                    longitude=b["lon"],
                    routes_serviced=b["routes"],
                    is_terminal=b["is_terminal"]
                )
                db.add(stop)
            print(f"Seeded {len(DTC_BUS_STOPS)} DTC bus stops.")

        # 3. Seed Fare Rules
        if db.query(TransitFareRule).count() == 0:
            for r in DMRC_FARE_RULES:
                rule = TransitFareRule(
                    system=r["system"],
                    min_distance_km=r["min_km"],
                    max_distance_km=r["max_km"],
                    standard_fare=r["std"],
                    smart_card_fare=r["card"],
                    off_peak_fare=r["offpeak"]
                )
                db.add(rule)
            print(f"Seeded {len(DMRC_FARE_RULES)} transit fare rules.")

        # 4. Seed Mobility Providers & Categories
        if db.query(MobilityProvider).count() == 0:
            for p in MOBILITY_PROVIDERS:
                prov = MobilityProvider(code=p["code"], display_name=p["display"], is_metered=p["is_metered"])
                db.add(prov)

        if db.query(ProviderVehicleCategory).count() == 0:
            for c in PROVIDER_CATEGORIES:
                cat = ProviderVehicleCategory(
                    provider_code=c["provider"],
                    category_code=c["code"],
                    display_name=c["name"],
                    vehicle_type=c["type"],
                    base_fare=c["base"],
                    base_distance_km=c["base_dist"],
                    per_km_rate=c["per_km"],
                    per_minute_rate=c["per_min"],
                    night_surcharge_pct=c["night_pct"],
                    waiting_charge_per_min=c["wait"],
                    minimum_fare=c["min_fare"]
                )
                db.add(cat)
            print(f"Seeded {len(PROVIDER_CATEGORIES)} provider vehicle categories.")

        # 5. Seed Initial Fare Observations for ML Calibration
        if db.query(FareObservation).count() == 0:
            observations = []
            now = datetime.utcnow()
            random.seed(42)

            for i in range(1200):
                # Sample random points around Delhi NCR
                pickup_lat = 28.50 + random.random() * 0.25
                pickup_lon = 77.10 + random.random() * 0.25
                dist_km = round(random.uniform(1.5, 38.0), 2)
                # Traffic speed between 15 km/h and 35 km/h
                speed = random.uniform(18.0, 32.0)
                dur_min = round((dist_km / speed) * 60.0, 1)

                cat = random.choice(PROVIDER_CATEGORIES)
                hour = random.randint(0, 23)
                day = random.randint(0, 6)
                is_peak = (8 <= hour <= 11) or (17 <= hour <= 21)
                is_weekend = day >= 5

                # Surge dynamics in Delhi
                surge = 1.0
                if is_peak:
                    surge = round(random.uniform(1.1, 1.45), 2)
                elif 0 <= hour <= 5 and cat["night_pct"] > 0:
                    surge = 1.25

                # Baseline computation
                base_dist = cat["base_dist"]
                chargeable_dist = max(0.0, dist_km - base_dist)
                calculated = cat["base"] + (chargeable_dist * cat["per_km"]) + (dur_min * cat["per_min"])
                quoted = round(max(cat["min_fare"], calculated * surge) + random.uniform(-6, 6), 1)

                obs = FareObservation(
                    provider_code=cat["provider"],
                    category_code=cat["code"],
                    pickup_lat=pickup_lat,
                    pickup_lon=pickup_lon,
                    drop_lat=pickup_lat + (dist_km * 0.007),
                    drop_lon=pickup_lon + (dist_km * 0.007),
                    distance_km=dist_km,
                    duration_min=dur_min,
                    quoted_fare=quoted,
                    surge_multiplier=surge,
                    hour_of_day=hour,
                    day_of_week=day,
                    is_weekend=is_weekend,
                    is_peak_hour=is_peak,
                    source="OBSERVED",
                    recorded_at=now - timedelta(hours=random.randint(1, 300))
                )
                observations.append(obs)

            db.bulk_save_objects(observations)
            print(f"Seeded {len(observations)} historical fare observations for Delhi NCR ML calibration.")

        # 6. Default User Preference
        if db.query(UserPreference).count() == 0:
            db.add(UserPreference(
                user_id="default_user",
                max_walking_meters=1500,
                max_budget_inr=500.0,
                preferred_mode="all",
                has_dmrc_smart_card=True,
                qualifies_for_pink_pass=False,
                prioritize_accessibility=False,
                speed_vs_cost_priority="best_overall"
            ))

        db.commit()
        print("Database seed completed successfully.")
    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    seed_database()
