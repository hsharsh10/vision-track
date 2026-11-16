from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, Text, Enum, ForeignKey
)
from sqlalchemy.orm import relationship
from backend.app.db.database import Base

class TransitStation(Base):
    __tablename__ = "transit_stations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, index=True)
    line_name = Column(String(50), nullable=False, index=True)  # Yellow, Blue, Red, Pink, Magenta, Violet, Airport Express, Rapid Metro, Aqua
    line_color = Column(String(20), nullable=False)            # Hex code e.g. #FFD700
    latitude = Column(Float, nullable=False, index=True)
    longitude = Column(Float, nullable=False, index=True)
    sequence_order = Column(Integer, nullable=False)
    is_interchange = Column(Boolean, default=False)
    interchange_lines = Column(String(200), default="")        # Comma-separated lines
    has_elevator = Column(Boolean, default=True)
    has_parking = Column(Boolean, default=True)
    zone_name = Column(String(50), default="Delhi NCR")

class BusStop(Base):
    __tablename__ = "bus_stops"

    id = Column(Integer, primary_key=True, index=True)
    stop_id = Column(String(50), unique=True, index=True)
    name = Column(String(100), nullable=False, index=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    routes_serviced = Column(Text, default="")                 # Comma-separated route numbers
    is_terminal = Column(Boolean, default=False)
    has_shelter = Column(Boolean, default=True)

class TransitFareRule(Base):
    __tablename__ = "transit_fare_rules"

    id = Column(Integer, primary_key=True, index=True)
    system = Column(String(50), nullable=False)                # DMRC, DTC_NON_AC, DTC_AC, RAPID_METRO, AQUA_LINE
    min_distance_km = Column(Float, nullable=False)
    max_distance_km = Column(Float, nullable=False)
    standard_fare = Column(Float, nullable=False)
    smart_card_fare = Column(Float, nullable=False)            # 10% discount on DMRC
    off_peak_fare = Column(Float, nullable=False)              # Additional 10% discount on DMRC off-peak
    currency = Column(String(10), default="INR")

class MobilityProvider(Base):
    __tablename__ = "mobility_providers"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), unique=True, nullable=False)     # uber, ola, rapido, delhi_metered_auto
    display_name = Column(String(100), nullable=False)
    is_metered = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)

class ProviderVehicleCategory(Base):
    __tablename__ = "provider_vehicle_categories"

    id = Column(Integer, primary_key=True, index=True)
    provider_code = Column(String(50), nullable=False, index=True)
    category_code = Column(String(50), nullable=False, index=True) # uber_go, uber_auto, uber_moto, ola_mini, ola_auto, rapido_bike, rapido_auto, rapido_cab, govt_metered_auto
    display_name = Column(String(100), nullable=False)
    vehicle_type = Column(String(30), nullable=False)          # cab, auto, bike
    base_fare = Column(Float, nullable=False)
    base_distance_km = Column(Float, default=1.0)
    per_km_rate = Column(Float, nullable=False)
    per_minute_rate = Column(Float, default=1.5)
    night_surcharge_pct = Column(Float, default=0.0)           # 25% for autos (11PM to 5AM)
    waiting_charge_per_min = Column(Float, default=0.75)
    minimum_fare = Column(Float, nullable=False)

class FareObservation(Base):
    __tablename__ = "fare_observations"

    id = Column(Integer, primary_key=True, index=True)
    provider_code = Column(String(50), nullable=False, index=True)
    category_code = Column(String(50), nullable=False, index=True)
    pickup_lat = Column(Float, nullable=False)
    pickup_lon = Column(Float, nullable=False)
    drop_lat = Column(Float, nullable=False)
    drop_lon = Column(Float, nullable=False)
    distance_km = Column(Float, nullable=False)
    duration_min = Column(Float, nullable=False)
    quoted_fare = Column(Float, nullable=False)
    surge_multiplier = Column(Float, default=1.0)
    hour_of_day = Column(Integer, nullable=False)
    day_of_week = Column(Integer, nullable=False)              # 0=Monday, 6=Sunday
    is_weekend = Column(Boolean, default=False)
    is_peak_hour = Column(Boolean, default=False)
    source = Column(String(50), default="OBSERVED")            # LIVE_QUOTE, OBSERVED, SYNTHETIC_CALIBRATED
    recorded_at = Column(DateTime, default=datetime.utcnow)

class UserPreference(Base):
    __tablename__ = "user_preferences"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(100), unique=True, index=True)
    max_walking_meters = Column(Integer, default=1200)
    max_budget_inr = Column(Float, default=500.0)
    preferred_mode = Column(String(50), default="all")         # all, public_only, cab_auto_only, mixed
    has_dmrc_smart_card = Column(Boolean, default=True)
    qualifies_for_pink_pass = Column(Boolean, default=False)   # Free DTC bus for women
    prioritize_accessibility = Column(Boolean, default=False)
    speed_vs_cost_priority = Column(String(50), default="best_overall") # fastest, cheapest, comfortable, best_overall, least_walking, least_transfers
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
