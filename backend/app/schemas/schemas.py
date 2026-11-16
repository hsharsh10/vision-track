from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum

class ModeType(str, Enum):
    WALK = "WALK"
    METRO = "METRO"
    BUS = "BUS"
    AUTO = "AUTO"
    CAB = "CAB"
    BIKE = "BIKE"

class FareSource(str, Enum):
    LIVE_API = "LIVE_API"
    OBSERVED = "OBSERVED"
    ML_PREDICTED = "ML_PREDICTED"
    ESTIMATED_FALLBACK = "ESTIMATED_FALLBACK"

class RoutePriority(str, Enum):
    BEST_OVERALL = "best_overall"
    FASTEST = "fastest"
    CHEAPEST = "cheapest"
    MOST_COMFORTABLE = "comfortable"
    LEAST_WALKING = "least_walking"
    LEAST_TRANSFERS = "least_transfers"
    ECO_FRIENDLY = "eco_friendly"

class TravelModeFilter(str, Enum):
    ALL = "all"
    PUBLIC_ONLY = "public_only"
    CAB_AUTO_ONLY = "cab_auto_only"
    MIXED = "mixed"

class Coordinates(BaseModel):
    lat: float
    lon: float

class LocationSource(str, Enum):
    GPS = "GPS"
    PLACES_AUTOCOMPLETE = "PLACES_AUTOCOMPLETE"
    MAP_PIN = "MAP_PIN"
    MANUAL_ADDRESS = "MANUAL_ADDRESS"

class StandardizedLocation(BaseModel):
    place_id: Optional[str] = None
    name: str
    formatted_address: str
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    source: LocationSource = LocationSource.MANUAL_ADDRESS
    accuracy_meters: Optional[float] = None

class LocationInfo(BaseModel):
    name: str
    latitude: float
    longitude: float

class FareEstimate(BaseModel):
    fare_inr: float
    range_min: float
    range_max: float
    confidence: str = "Medium"  # High, Medium, Low
    source: FareSource = FareSource.ML_PREDICTED
    data_freshness_desc: str = "Updated within 15 mins"
    details: Dict[str, Any] = {}

class RouteLeg(BaseModel):
    """
    Standardized Route Leg data model.
    Every route contains an ordered array of these legs.
    """
    leg_id: str
    sequence: int
    mode: ModeType
    provider: str
    start_location: LocationInfo
    end_location: LocationInfo
    distance_meters: float
    duration_seconds: float
    fare: float
    start_time: str
    end_time: str
    encoded_polyline: str
    decoded_coordinates: List[List[float]]
    vehicle_or_transit_details: Dict[str, Any] = {}
    
    # Backward compatibility helpers
    instructions: str = ""
    line_color: Optional[str] = None
    fare_estimate: Optional[FareEstimate] = None

    # Properties to bridge legacy segment field names
    @property
    def distance_km(self) -> float:
        return round(self.distance_meters / 1000.0, 3)

    @property
    def duration_min(self) -> float:
        return round(self.duration_seconds / 60.0, 1)

    @property
    def fare_inr(self) -> float:
        return self.fare

    @property
    def path_coords(self) -> List[List[float]]:
        return self.decoded_coordinates

# RouteSegment alias for backward compatibility
RouteSegment = RouteLeg

class RouteOption(BaseModel):
    id: str
    title: str
    route_name: str
    summary_badges: List[str]
    category_tag: str
    
    # Timeline
    departure_time: str
    arrival_time: str
    
    # Fares
    total_estimated_fare: float
    total_fare_inr: float
    fare_estimate: FareEstimate
    direct_cab_savings_inr: float
    direct_cab_fare_inr: float
    
    # Duration
    total_journey_duration_min: float
    total_duration_min: float
    total_duration_seconds: float
    
    # Distance breakdown strictly calculated from legs
    walking_distance_meters: float
    driving_distance_meters: float
    metro_distance_meters: float
    bus_distance_meters: float
    total_distance_meters: float
    total_walking_km: float
    
    # Vehicle and transfer counts
    transfer_count: int
    motorized_legs_count: int
    
    # Additional
    co2_saved_kg: float
    score: float
    is_recommended: bool = False
    warning: Optional[str] = None
    
    # Legs / segments
    legs: List[RouteLeg]
    segments: List[RouteLeg]

class SearchRequest(BaseModel):
    # Dynamic location objects
    pickup: Optional[StandardizedLocation] = None
    destination: Optional[StandardizedLocation] = None

    # Backward compatible fields
    origin_name: Optional[str] = None
    origin_lat: Optional[float] = None
    origin_lon: Optional[float] = None
    dest_name: Optional[str] = None
    dest_lat: Optional[float] = None
    dest_lon: Optional[float] = None

    travel_datetime: Optional[str] = None
    passenger_count: int = Field(default=1, ge=1, le=6)
    mode_preference: TravelModeFilter = TravelModeFilter.ALL
    priority: RoutePriority = RoutePriority.BEST_OVERALL
    max_walking_meters: int = Field(default=1500, ge=100, le=10000)
    max_budget_inr: Optional[float] = None
    has_smart_card: bool = True
    pink_pass: bool = False
    wheelchair_accessible: bool = False

    def resolve_pickup(self) -> tuple[str, float, float]:
        if self.pickup:
            return self.pickup.name or self.pickup.formatted_address, self.pickup.latitude, self.pickup.longitude
        return self.origin_name or "Pickup Location", self.origin_lat or 28.6139, self.origin_lon or 77.2090

    def resolve_dest(self) -> tuple[str, float, float]:
        if self.destination:
            return self.destination.name or self.destination.formatted_address, self.destination.latitude, self.destination.longitude
        return self.dest_name or "Destination", self.dest_lat or 28.6443, self.dest_lon or 77.1903

class SearchResponse(BaseModel):
    query: SearchRequest
    direct_cab_benchmark: RouteOption
    routes: List[RouteOption]
    total_options_analyzed: int
    computation_time_ms: float
    disclaimer: str = "Prices, distances, and travel times are computed using ground-truth transit rules, calibrated ML models, and verified geometry."

class UserPreferenceUpdate(BaseModel):
    max_walking_meters: Optional[int] = 1200
    max_budget_inr: Optional[float] = 500.0
    preferred_mode: Optional[str] = "all"
    has_dmrc_smart_card: Optional[bool] = True
    qualifies_for_pink_pass: Optional[bool] = False
    prioritize_accessibility: Optional[bool] = False
    speed_vs_cost_priority: Optional[str] = "best_overall"
