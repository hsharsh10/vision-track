import { create } from "zustand";
import {
  SearchRequest,
  SearchResponse,
  RouteOption,
  RoutePriority,
  TravelModeFilter,
  StandardizedLocation,
} from "../types";
import { searchRoutes } from "../api/client";
import { generateSampleRoutes } from "../services/sampleRoutes";
import { fetchLiveDirections, loadGoogleMapsScript } from "../services/googleMaps";

const GOOGLE_MAPS_KEY =
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY ||
  "AIzaSyCqh4jRK4ZKwsmHn7PyNLYlAf0UbGxlnjI";

interface LiveDataStatus {
  backendOnline: boolean;
  googleMapsReady: boolean;
  lastFetchedAt: string | null;
  liveTravelTimeMin: number | null;
  liveTravelDistanceKm: number | null;
}

interface MobilityState {
  searchQuery: SearchRequest;
  searchResult: SearchResponse | null;
  selectedRoute: RouteOption | null;
  isLoading: boolean;
  error: string | null;
  showPreferencesModal: boolean;
  showMetricsModal: boolean;
  activePriorityTab: RoutePriority;
  activeView: "cards" | "map";
  hasSearched: boolean;
  locationError: string | null;
  liveData: LiveDataStatus;

  // Dynamic Location System State
  pickupLocation: StandardizedLocation | null;
  destLocation: StandardizedLocation | null;
  currentGPSLocation: StandardizedLocation | null;
  isPickerOpen: boolean;
  pickerTarget: "origin" | "dest";

  // Actions
  setSearchQuery: (query: Partial<SearchRequest>) => void;
  setPickupLocation: (loc: StandardizedLocation) => void;
  setDestLocation: (loc: StandardizedLocation) => void;
  setCurrentGPSLocation: (loc: StandardizedLocation | null) => void;
  openLocationPicker: (target: "origin" | "dest") => void;
  closeLocationPicker: () => void;
  setSelectedRoute: (route: RouteOption | null) => void;
  setShowPreferencesModal: (show: boolean) => void;
  setShowMetricsModal: (show: boolean) => void;
  setActivePriorityTab: (priority: RoutePriority) => void;
  setActiveView: (view: "cards" | "map") => void;
  setModePreference: (mode: TravelModeFilter) => void;
  setLocationError: (err: string | null) => void;
  executeSearch: () => Promise<void>;
  swapLocations: () => void;
  clearSearch: () => void;
  loadSampleRoute: (sample?: "connaught_karol" | "cp_cybercity") => void;
  fetchLiveGoogleData: () => Promise<void>;
}

const defaultQuery: SearchRequest = {
  origin_name: "Connaught Place",
  origin_lat: 28.6328,
  origin_lon: 77.2197,
  dest_name: "Karol Bagh",
  dest_lat: 28.6443,
  dest_lon: 77.1903,
  travel_date: "12-11-2026",
  travel_time: "12:39",
  passenger_count: 1,
  mode_preference: "all",
  priority: "best_overall",
  max_walking_meters: 1500,
  max_budget_inr: 600,
  has_smart_card: true,
  pink_pass: false,
  wheelchair_accessible: false,
};

const defaultLiveData: LiveDataStatus = {
  backendOnline: false,
  googleMapsReady: false,
  lastFetchedAt: null,
  liveTravelTimeMin: null,
  liveTravelDistanceKm: null,
};

export const useMobilityStore = create<MobilityState>((set, get) => ({
  searchQuery: defaultQuery,
  searchResult: null,
  selectedRoute: null,
  isLoading: false,
  error: null,
  showPreferencesModal: false,
  showMetricsModal: false,
  activePriorityTab: "best_overall",
  activeView: "cards",
  hasSearched: true,
  locationError: null,
  liveData: defaultLiveData,

  // Dynamic Location State
  pickupLocation: null,
  destLocation: null,
  currentGPSLocation: null,
  isPickerOpen: false,
  pickerTarget: "origin",

  setSearchQuery: (queryUpdate) =>
    set((state) => ({
      searchQuery: { ...state.searchQuery, ...queryUpdate },
    })),

  setPickupLocation: (loc) => {
    set((state) => ({
      pickupLocation: loc,
      searchQuery: {
        ...state.searchQuery,
        origin_name: loc.name,
        origin_lat: loc.latitude,
        origin_lon: loc.longitude,
        pickup: loc,
      },
      locationError: null,
    }));
    get().executeSearch();
  },

  setDestLocation: (loc) => {
    set((state) => ({
      destLocation: loc,
      searchQuery: {
        ...state.searchQuery,
        dest_name: loc.name,
        dest_lat: loc.latitude,
        dest_lon: loc.longitude,
        destination: loc,
      },
      locationError: null,
    }));
    get().executeSearch();
  },

  setCurrentGPSLocation: (loc) => set({ currentGPSLocation: loc }),
  openLocationPicker: (target) => set({ isPickerOpen: true, pickerTarget: target }),
  closeLocationPicker: () => set({ isPickerOpen: false }),

  setSelectedRoute: (route) => set({ selectedRoute: route }),
  setShowPreferencesModal: (show) => set({ showPreferencesModal: show }),
  setShowMetricsModal: (show) => set({ showMetricsModal: show }),
  setActiveView: (view) => set({ activeView: view }),
  setLocationError: (err) => set({ locationError: err }),

  setActivePriorityTab: (priority) => {
    set((state) => ({
      activePriorityTab: priority,
      searchQuery: { ...state.searchQuery, priority },
    }));
    get().executeSearch();
  },

  setModePreference: (mode) => {
    set((state) => ({
      searchQuery: { ...state.searchQuery, mode_preference: mode },
    }));
    get().executeSearch();
  },

  swapLocations: () => {
    const q = get().searchQuery;
    const pLoc = get().pickupLocation;
    const dLoc = get().destLocation;
    set({
      pickupLocation: dLoc,
      destLocation: pLoc,
      searchQuery: {
        ...q,
        origin_name: q.dest_name,
        origin_lat: q.dest_lat,
        origin_lon: q.dest_lon,
        dest_name: q.origin_name,
        dest_lat: q.origin_lat,
        dest_lon: q.origin_lon,
        pickup: dLoc || undefined,
        destination: pLoc || undefined,
      },
    });
    get().executeSearch();
  },

  clearSearch: () => {
    set((state) => ({
      searchQuery: {
        ...state.searchQuery,
        origin_name: "",
        dest_name: "",
      },
      searchResult: null,
      selectedRoute: null,
      hasSearched: false,
      locationError: null,
      liveData: defaultLiveData,
    }));
  },

  loadSampleRoute: (sample = "connaught_karol") => {
    if (sample === "connaught_karol") {
      set({
        searchQuery: {
          ...defaultQuery,
          origin_name: "Connaught Place",
          dest_name: "Karol Bagh",
          travel_time: "12:39",
          mode_preference: "all",
        },
        hasSearched: true,
        locationError: null,
      });
    } else {
      set({
        searchQuery: {
          ...defaultQuery,
          origin_name: "Connaught Place",
          dest_name: "DLF Cyber City, Gurugram",
          dest_lat: 28.4967,
          dest_lon: 77.0903,
          travel_time: "12:39",
          mode_preference: "all",
        },
        hasSearched: true,
        locationError: null,
      });
    }
    get().executeSearch();
  },

  // ── Live Google Maps Data Fetch ──────────────────────────────────────────
  fetchLiveGoogleData: async () => {
    const q = get().searchQuery;
    if (!q.origin_lat || !q.dest_lat) return;

    try {
      const mapsOk = await loadGoogleMapsScript(GOOGLE_MAPS_KEY);
      if (mapsOk) {
        set((state) => ({
          liveData: { ...state.liveData, googleMapsReady: true },
        }));
      }
      const liveResult = await fetchLiveDirections(
        q.origin_lat, q.origin_lon,
        q.dest_lat, q.dest_lon,
        "DRIVING"
      );

      if (liveResult) {
        set((state) => ({
          liveData: {
            ...state.liveData,
            googleMapsReady: true,
            lastFetchedAt: new Date().toLocaleTimeString("en-IN"),
            liveTravelTimeMin: Math.round(liveResult.durationSeconds / 60),
            liveTravelDistanceKm: parseFloat((liveResult.distanceMeters / 1000).toFixed(1)),
          },
        }));
      }
    } catch {
      // silently ignore live data errors — UI still functions with ML predictions
    }
  },

  // ── Main Route Search ────────────────────────────────────────────────────
  executeSearch: async () => {
    const query = get().searchQuery;
    if (!query.origin_name || !query.dest_name) {
      set({ hasSearched: false, searchResult: null });
      return;
    }

    set({ isLoading: true, error: null, hasSearched: true });

    // Fire live Google Maps data fetch in parallel (non-blocking)
    get().fetchLiveGoogleData();

    try {
      // 1️⃣  Try live FastAPI backend
      const result = await searchRoutes(query);
      set({
        searchResult: result,
        isLoading: false,
        selectedRoute: result.routes.length > 0 ? result.routes[0] : null,
        liveData: { ...get().liveData, backendOnline: true },
        error: null,
      });
    } catch {
      // 2️⃣  Graceful fallback to sample transit network
      const fallbackResult = generateSampleRoutes(query);
      set({
        searchResult: fallbackResult,
        isLoading: false,
        selectedRoute:
          fallbackResult.routes.length > 0 ? fallbackResult.routes[0] : null,
        liveData: { ...get().liveData, backendOnline: false },
        error: "Backend offline — showing calibrated ML estimates. Live API prices connect when server is running.",
      });
    }
  },
}));
