import { SearchRequest, SearchResponse, RouteOption, RouteSegment, ModeType, FareEstimate, FareSource } from "../types";

export const generateSampleRoutes = (query: SearchRequest): SearchResponse => {
  const isConnaughtToKarolBagh =
    query.origin_name.toLowerCase().includes("connaught") &&
    query.dest_name.toLowerCase().includes("karol");

  const departureTime = query.travel_time || "12:39";

  // Helper to format arrival time given start time string like "12:39" and minutes to add
  const computeTimes = (depStr: string, durationMin: number) => {
    try {
      const parts = depStr.split(":");
      let hours = parseInt(parts[0], 10) || 12;
      let minutes = parseInt(parts[1], 10) || 39;
      const totalMinutes = hours * 60 + minutes + Math.round(durationMin);

      const arrHours = Math.floor(totalMinutes / 60) % 24;
      const arrMins = totalMinutes % 60;

      const format12h = (h: number, m: number) => {
        const period = h >= 12 ? "pm" : "am";
        const h12 = h % 12 === 0 ? 12 : h % 12;
        const padH = h12 < 10 ? `0${h12}` : `${h12}`;
        const padM = m < 10 ? `0${m}` : `${m}`;
        return `${padH}:${padM} ${period}`;
      };

      return {
        departs: format12h(hours, minutes),
        arrives: format12h(arrHours, arrMins),
      };
    } catch {
      return { departs: "12:39 pm", arrives: "01:08 pm" };
    }
  };

  const defaultEstimate = (fare: number): FareEstimate => ({
    fare_inr: fare,
    range_min: Math.round(fare * 0.9),
    range_max: Math.round(fare * 1.15),
    confidence: "Low",
    source: "ESTIMATED_FALLBACK" as FareSource,
    data_freshness_desc: "Sample transit network and baseline fare formula",
    details: { baseline: true },
  });

  // Benchmark cab
  const directCabFare = 129;
  const benchmarkCab: RouteOption = {
    id: "cab-direct-benchmark",
    title: "Direct Cab (Uber Go)",
    summary_badges: ["Direct", "Air Conditioned"],
    category_tag: "DIRECT_CAB",
    total_duration_min: 22,
    total_fare_inr: directCabFare,
    fare_estimate: defaultEstimate(directCabFare),
    total_walking_km: 0.1,
    transfer_count: 0,
    direct_cab_savings_inr: 0,
    direct_cab_fare_inr: directCabFare,
    co2_saved_kg: 0.1,
    score: 95,
    segments: [
      {
        mode: "CAB" as ModeType,
        provider: "Uber",
        vehicle_name: "Uber Go",
        from_name: query.origin_name || "Connaught Place",
        to_name: query.dest_name || "Karol Bagh",
        distance_km: 5.4,
        duration_min: 22,
        wait_time_min: 4,
        fare_inr: directCabFare,
        fare_estimate: defaultEstimate(directCabFare),
        instructions: `Take Uber Go directly from ${query.origin_name} to ${query.dest_name}`,
        line_color: "#2563eb",
        path_coords: [
          [query.origin_lat || 28.6328, query.origin_lon || 77.2197],
          [query.dest_lat || 28.6443, query.dest_lon || 77.1903],
        ],
        is_accessible: true,
      },
    ],
  };

  // If specific mode preference is selected
  const modePref = query.mode_preference;

  // Exact routes from screenshots
  const route1Times = computeTimes(departureTime, 29);
  const route1: RouteOption = {
    id: "route-rapido-metro-uber",
    title: "Rapido Cab → Sample Metro Line → Uber Cab",
    summary_badges: ["Multimodal", "Sample Line"],
    category_tag: "BEST_OVERALL",
    total_duration_min: 29,
    total_fare_inr: 234,
    fare_estimate: defaultEstimate(234),
    total_walking_km: 0,
    transfer_count: 2,
    direct_cab_savings_inr: -105,
    direct_cab_fare_inr: directCabFare,
    co2_saved_kg: 1.2,
    score: 92,
    is_recommended: true,
    segments: [
      {
        mode: "CAB" as ModeType,
        provider: "Rapido Cab",
        vehicle_name: "Rapido Cab",
        from_name: query.origin_name || "Connaught Place",
        to_name: "Rajiv Chowk Metro Gate 3",
        distance_km: 1.2,
        duration_min: 6,
        wait_time_min: 3,
        fare_inr: 85,
        fare_estimate: defaultEstimate(85),
        instructions: "Take Rapido Cab to Rajiv Chowk Metro Station",
        line_color: "#0284c7",
        path_coords: [
          [28.6328, 77.2197],
          [28.634, 77.2185],
        ],
        is_accessible: true,
      },
      {
        mode: "METRO" as ModeType,
        provider: "Sample Metro Line",
        vehicle_name: "Sample Metro Line",
        from_name: "Rajiv Chowk",
        to_name: "Karol Bagh Station",
        distance_km: 3.8,
        duration_min: 13,
        wait_time_min: 2,
        fare_inr: 30,
        fare_estimate: defaultEstimate(30),
        instructions: "Board Sample Metro Line (Blue Line towards Dwarka)",
        line_color: "#2563eb",
        path_coords: [
          [28.6328, 77.2197],
          [28.6392, 77.2091],
          [28.6443, 77.1903],
        ],
        is_accessible: true,
      },
      {
        mode: "CAB" as ModeType,
        provider: "Uber Cab",
        vehicle_name: "Uber Cab",
        from_name: "Karol Bagh Metro Gate 1",
        to_name: query.dest_name || "Karol Bagh",
        distance_km: 1.5,
        duration_min: 10,
        wait_time_min: 4,
        fare_inr: 119,
        fare_estimate: defaultEstimate(119),
        instructions: "Take Uber Cab to your final destination",
        line_color: "#0f172a",
        path_coords: [
          [28.6443, 77.1903],
          [28.648, 77.188],
        ],
        is_accessible: true,
      },
    ],
  };

  const route2Times = computeTimes(departureTime, 30);
  const route2: RouteOption = {
    id: "route-ola-metro-ola",
    title: "Ola Cab → Sample Metro Line → Ola Cab",
    summary_badges: ["Multimodal", "Budget Ride"],
    category_tag: "CHEAPEST_COMBO",
    total_duration_min: 30,
    total_fare_inr: 233,
    fare_estimate: defaultEstimate(233),
    total_walking_km: 0,
    transfer_count: 2,
    direct_cab_savings_inr: -104,
    direct_cab_fare_inr: directCabFare,
    co2_saved_kg: 1.1,
    score: 89,
    segments: [
      {
        mode: "CAB" as ModeType,
        provider: "Ola Cab",
        vehicle_name: "Ola Cab",
        from_name: query.origin_name || "Connaught Place",
        to_name: "Rajiv Chowk Metro Gate 7",
        distance_km: 1.2,
        duration_min: 7,
        wait_time_min: 3,
        fare_inr: 89,
        fare_estimate: defaultEstimate(89),
        instructions: "Take Ola Mini to Rajiv Chowk Metro",
        line_color: "#16a34a",
        path_coords: [
          [28.6328, 77.2197],
          [28.634, 77.2185],
        ],
        is_accessible: true,
      },
      {
        mode: "METRO" as ModeType,
        provider: "Sample Metro Line",
        vehicle_name: "Sample Metro Line",
        from_name: "Rajiv Chowk",
        to_name: "Karol Bagh Station",
        distance_km: 3.8,
        duration_min: 13,
        wait_time_min: 2,
        fare_inr: 30,
        fare_estimate: defaultEstimate(30),
        instructions: "Take Sample Metro Line towards Karol Bagh",
        line_color: "#2563eb",
        path_coords: [
          [28.6328, 77.2197],
          [28.6392, 77.2091],
          [28.6443, 77.1903],
        ],
        is_accessible: true,
      },
      {
        mode: "CAB" as ModeType,
        provider: "Ola Cab",
        vehicle_name: "Ola Cab",
        from_name: "Karol Bagh Station",
        to_name: query.dest_name || "Karol Bagh",
        distance_km: 1.4,
        duration_min: 10,
        wait_time_min: 4,
        fare_inr: 114,
        fare_estimate: defaultEstimate(114),
        instructions: "Take Ola Cab from Metro Gate 2 to destination",
        line_color: "#16a34a",
        path_coords: [
          [28.6443, 77.1903],
          [28.648, 77.188],
        ],
        is_accessible: true,
      },
    ],
  };

  const route3Times = computeTimes(departureTime, 30);
  const route3: RouteOption = {
    id: "route-uber-metro-uber",
    title: "Uber Cab → Sample Metro Line → Uber Cab",
    summary_badges: ["Multimodal", "Comfort"],
    category_tag: "COMFORTABLE",
    total_duration_min: 30,
    total_fare_inr: 254,
    fare_estimate: defaultEstimate(254),
    total_walking_km: 0,
    transfer_count: 2,
    direct_cab_savings_inr: -125,
    direct_cab_fare_inr: directCabFare,
    co2_saved_kg: 1.0,
    score: 87,
    segments: [
      {
        mode: "CAB" as ModeType,
        provider: "Uber Cab",
        vehicle_name: "Uber Cab",
        from_name: query.origin_name || "Connaught Place",
        to_name: "Rajiv Chowk Metro Gate 4",
        distance_km: 1.2,
        duration_min: 7,
        wait_time_min: 3,
        fare_inr: 98,
        fare_estimate: defaultEstimate(98),
        instructions: "Take Uber Cab to Rajiv Chowk",
        line_color: "#0f172a",
        path_coords: [
          [28.6328, 77.2197],
          [28.634, 77.2185],
        ],
        is_accessible: true,
      },
      {
        mode: "METRO" as ModeType,
        provider: "Sample Metro Line",
        vehicle_name: "Sample Metro Line",
        from_name: "Rajiv Chowk",
        to_name: "Karol Bagh Station",
        distance_km: 3.8,
        duration_min: 13,
        wait_time_min: 2,
        fare_inr: 30,
        fare_estimate: defaultEstimate(30),
        instructions: "Board Sample Metro Line",
        line_color: "#2563eb",
        path_coords: [
          [28.6328, 77.2197],
          [28.6392, 77.2091],
          [28.6443, 77.1903],
        ],
        is_accessible: true,
      },
      {
        mode: "CAB" as ModeType,
        provider: "Uber Cab",
        vehicle_name: "Uber Cab",
        from_name: "Karol Bagh Station",
        to_name: query.dest_name || "Karol Bagh",
        distance_km: 1.4,
        duration_min: 10,
        wait_time_min: 4,
        fare_inr: 126,
        fare_estimate: defaultEstimate(126),
        instructions: "Take Uber Cab to destination",
        line_color: "#0f172a",
        path_coords: [
          [28.6443, 77.1903],
          [28.648, 77.188],
        ],
        is_accessible: true,
      },
    ],
  };

  // Public transit only option
  const routePublic: RouteOption = {
    id: "route-metro-walk",
    title: "Walk → DMRC Blue Line → Walk",
    summary_badges: ["Pure Metro", "Lowest Fare", "Zero Traffic"],
    category_tag: "CHEAPEST",
    total_duration_min: 24,
    total_fare_inr: 30,
    fare_estimate: defaultEstimate(30),
    total_walking_km: 0.6,
    transfer_count: 0,
    direct_cab_savings_inr: directCabFare - 30,
    direct_cab_fare_inr: directCabFare,
    co2_saved_kg: 2.1,
    score: 96,
    segments: [
      {
        mode: "WALK" as ModeType,
        provider: "Walking",
        vehicle_name: "Walk",
        from_name: query.origin_name || "Connaught Place",
        to_name: "Rajiv Chowk Metro Gate 2",
        distance_km: 0.3,
        duration_min: 4,
        wait_time_min: 0,
        fare_inr: 0,
        fare_estimate: defaultEstimate(0),
        instructions: "Walk 300m to Rajiv Chowk Metro station",
        line_color: "#94a3b8",
        path_coords: [
          [28.6328, 77.2197],
          [28.634, 77.2185],
        ],
        is_accessible: true,
      },
      {
        mode: "METRO" as ModeType,
        provider: "DMRC",
        vehicle_name: "Blue Line Metro",
        from_name: "Rajiv Chowk",
        to_name: "Karol Bagh",
        distance_km: 3.8,
        duration_min: 14,
        wait_time_min: 2,
        fare_inr: 30,
        fare_estimate: defaultEstimate(30),
        instructions: "Take Blue Line (towards Dwarka Sector 21) direct to Karol Bagh",
        line_color: "#2563eb",
        path_coords: [
          [28.6328, 77.2197],
          [28.6392, 77.2091],
          [28.6443, 77.1903],
        ],
        is_accessible: true,
      },
      {
        mode: "WALK" as ModeType,
        provider: "Walking",
        vehicle_name: "Walk",
        from_name: "Karol Bagh Metro Gate 1",
        to_name: query.dest_name || "Karol Bagh Market",
        distance_km: 0.3,
        duration_min: 4,
        wait_time_min: 0,
        fare_inr: 0,
        fare_estimate: defaultEstimate(0),
        instructions: "Walk 300m to destination",
        line_color: "#94a3b8",
        path_coords: [
          [28.6443, 77.1903],
          [28.6465, 77.1895],
        ],
        is_accessible: true,
      },
    ],
  };

  let routes: RouteOption[] = [];

  if (modePref === "public_only") {
    routes = [routePublic];
  } else if (modePref === "cab_auto_only") {
    routes = [benchmarkCab];
  } else if (modePref === "mixed") {
    routes = [route1, route2, route3];
  } else {
    // "all"
    routes = [route1, route2, route3, routePublic, benchmarkCab];
  }

  return {
    query,
    direct_cab_benchmark: benchmarkCab,
    routes,
    total_options_analyzed: 14,
    computation_time_ms: 18,
    disclaimer:
      "This version uses a sample transit network and baseline fare estimates. No live Ola, Uber or Rapido quotes are connected yet, so prices are estimates rather than guaranteed fares.",
  };
};
