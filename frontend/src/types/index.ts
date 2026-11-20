export type ModeType = "WALK" | "METRO" | "BUS" | "AUTO" | "CAB" | "BIKE";

export type FareSource = "LIVE_API" | "OBSERVED" | "ML_PREDICTED" | "ESTIMATED_FALLBACK";

export type RoutePriority =
  | "best_overall"
  | "fastest"
  | "cheapest"
  | "comfortable"
  | "least_walking"
  | "least_transfers"
  | "eco_friendly";

export type TravelModeFilter = "all" | "public_only" | "cab_auto_only" | "mixed";

export interface FareEstimate {
  fare_inr: number;
  range_min: number;
  range_max: number;
  confidence: "High" | "Medium" | "Low";
  source: FareSource;
  data_freshness_desc: string;
  details: Record<string, any>;
}

export type LocationSource = "GPS" | "PLACES_AUTOCOMPLETE" | "MAP_PIN" | "MANUAL_ADDRESS";

export interface StandardizedLocation {
  place_id?: string;
  name: string;
  formatted_address: string;
  latitude: number;
  longitude: number;
  source: LocationSource;
  accuracy_meters?: number;
}

export interface LocationInfo {
  name: string;
  latitude: number;
  longitude: number;
}

export interface RouteLeg {
  leg_id?: string;
  sequence?: number;
  mode: ModeType;
  provider: string;
  start_location?: LocationInfo;
  end_location?: LocationInfo;
  distance_meters?: number;
  duration_seconds?: number;
  fare?: number;
  start_time?: string;
  end_time?: string;
  encoded_polyline?: string;
  decoded_coordinates?: [number, number][];
  vehicle_or_transit_details?: Record<string, any>;

  // Backward compatibility fields
  vehicle_name?: string;
  from_name?: string;
  to_name?: string;
  distance_km?: number;
  duration_min?: number;
  wait_time_min?: number;
  fare_inr?: number;
  fare_estimate?: FareEstimate;
  instructions?: string;
  line_color?: string;
  path_coords?: [number, number][];
  is_accessible?: boolean;
}

export type RouteSegment = RouteLeg;

export interface RouteOption {
  id: string;
  title: string;
  route_name?: string;
  summary_badges: string[];
  category_tag: string;
  departure_time?: string;
  arrival_time?: string;
  total_estimated_fare?: number;
  total_fare_inr: number;
  fare_estimate: FareEstimate;
  total_journey_duration_min?: number;
  total_duration_min: number;
  total_duration_seconds?: number;
  walking_distance_meters?: number;
  driving_distance_meters?: number;
  metro_distance_meters?: number;
  bus_distance_meters?: number;
  total_distance_meters?: number;
  total_walking_km: number;
  transfer_count: number;
  motorized_legs_count?: number;
  direct_cab_savings_inr: number;
  direct_cab_fare_inr: number;
  co2_saved_kg: number;
  score: number;
  legs?: RouteLeg[];
  segments: RouteLeg[];
  is_recommended?: boolean;
  warning?: string;
}

export interface SearchRequest {
  origin_name: string;
  origin_lat?: number;
  origin_lon?: number;
  dest_name: string;
  dest_lat?: number;
  dest_lon?: number;
  pickup?: StandardizedLocation;
  destination?: StandardizedLocation;
  travel_date?: string;
  travel_time?: string;
  travel_datetime?: string;
  passenger_count: number;
  mode_preference: TravelModeFilter;
  priority: RoutePriority;
  max_walking_meters: number;
  max_budget_inr?: number;
  has_smart_card: boolean;
  pink_pass: boolean;
  wheelchair_accessible: boolean;
}

export interface SearchResponse {
  query: SearchRequest;
  direct_cab_benchmark: RouteOption;
  routes: RouteOption[];
  total_options_analyzed: number;
  computation_time_ms: number;
  disclaimer: string;
}

export interface PopularCorridor {
  id: string;
  title: string;
  origin: { name: string; lat: number; lon: number };
  dest: { name: string; lat: number; lon: number };
  description: string;
}

export interface MLModelMetrics {
  mae: number;
  mdae: number;
  e90: number;
  samples: number;
}
