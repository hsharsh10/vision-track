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
import { fetchOlaLiveDirections } from "../services/olaMaps";

interface LiveDataStatus {
  backendOnline: boolean;
  googleMapsReady: boolean;
  olaMapsReady: boolean;
  lastFetchedAt: string | null;
  liveTravelTimeMin: number | null;
  liveTravelDistanceKm: number | null;
}

export const defaultPickupLocation: StandardizedLocation = {
  name: "Connaught Place",
  formatted_address: "Connaught Place, New Delhi, Delhi 110001, India",
  latitude: 28.6328,
  longitude: 77.2197,
  source: "MANUAL_ADDRESS",
};

export const defaultDestLocation: StandardizedLocation = {
  name: "Karol Bagh",
  formatted_address: "Karol Bagh, New Delhi, Delhi 110005, India",
  latitude: 28.6443,
  longitude: 77.1903,
  source: "MANUAL_ADDRESS",
};

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

  // Single Source of Truth for Dynamic Locations
  pickupLocation: StandardizedLocation | null;
  destLocation: StandardizedLocation | null;
  currentGPSLocation: StandardizedLocation | null;
  isPickerOpen: boolean;
  pickerTarget: "origin" | "dest";

  // Actions
  setSearchQuery: (query: Partial<SearchRequest>) => void;
  setPickupLocation: (loc: StandardizedLocation) => void;
  setDestLocation: (loc: StandardizedLocation) => void;
  clearPickupLocation: () => void;
  clearDestLocation: () => void;
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
  origin_name: "",
  origin_lat: undefined,
  origin_lon: undefined,
  pickup: undefined,
  dest_name: "",
  dest_lat: undefined,
  dest_lon: undefined,
  destination: undefined,
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
  googleMapsReady: true,
  olaMapsReady: true,
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
  hasSearched: false,
  locationError: null,
  liveData: defaultLiveData,

  // Empty initial state matching clean entry view
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
    // Primary display is ALWAYS the full formatted address
    const fullAddress = loc.formatted_address || loc.name || "Selected Pickup";
    set((state) => ({
      pickupLocation: loc,
      searchQuery: {
        ...state.searchQuery,
        origin_name: fullAddress,
        origin_lat: loc.latitude,
        origin_lon: loc.longitude,
        pickup: loc,
      },
      locationError: null,
    }));
    get().executeSearch();
  },

  setDestLocation: (loc) => {
    // Primary display is ALWAYS the full formatted address
    const fullAddress = loc.formatted_address || loc.name || "Selected Destination";
    set((state) => ({
      destLocation: loc,
      searchQuery: {
        ...state.searchQuery,
        dest_name: fullAddress,
        dest_lat: loc.latitude,
        dest_lon: loc.longitude,
        destination: loc,
      },
      locationError: null,
    }));
    get().executeSearch();
  },

  clearPickupLocation: () => {
    set((state) => ({
      pickupLocation: null,
      searchQuery: {
        ...state.searchQuery,
        origin_name: "",
        origin_lat: undefined,
        origin_lon: undefined,
        pickup: undefined,
      },
      locationError: null,
    }));
  },

  clearDestLocation: () => {
    set((state) => ({
      destLocation: null,
      searchQuery: {
        ...state.searchQuery,
        dest_name: "",
        dest_lat: undefined,
        dest_lon: undefined,
        destination: undefined,
      },
      locationError: null,
    }));
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

    const newPickup = dLoc;
    const newDest = pLoc;

    const newOriginName = newPickup
      ? newPickup.formatted_address || newPickup.name
      : q.dest_name;
    const newDestName = newDest
      ? newDest.formatted_address || newDest.name
      : q.origin_name;

    set({
      pickupLocation: newPickup,
      destLocation: newDest,
      searchQuery: {
        ...q,
        origin_name: newOriginName,
        origin_lat: newPickup?.latitude ?? q.dest_lat,
        origin_lon: newPickup?.longitude ?? q.dest_lon,
        dest_name: newDestName,
        dest_lat: newDest?.latitude ?? q.origin_lat,
        dest_lon: newDest?.longitude ?? q.origin_lon,
        pickup: newPickup || undefined,
        destination: newDest || undefined,
      },
      locationError: null,
    });
    get().executeSearch();
  },

  clearSearch: () => {
    set((state) => ({
      pickupLocation: null,
      destLocation: null,
      searchQuery: {
        ...state.searchQuery,
        origin_name: "",
        origin_lat: undefined,
        origin_lon: undefined,
        pickup: undefined,
        dest_name: "",
        dest_lat: undefined,
        dest_lon: undefined,
        destination: undefined,
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
        pickupLocation: defaultPickupLocation,
        destLocation: defaultDestLocation,
        searchQuery: {
          ...defaultQuery,
          origin_name: defaultPickupLocation.formatted_address,
          origin_lat: defaultPickupLocation.latitude,
          origin_lon: defaultPickupLocation.longitude,
          pickup: defaultPickupLocation,
          dest_name: defaultDestLocation.formatted_address,
          dest_lat: defaultDestLocation.latitude,
          dest_lon: defaultDestLocation.longitude,
          destination: defaultDestLocation,
          travel_time: "12:39",
          mode_preference: "all",
        },
        hasSearched: true,
        locationError: null,
      });
    } else {
      const cyberHubLoc: StandardizedLocation = {
        name: "DLF Cyber City, Phase 2 Gurugram",
        formatted_address: "DLF Cyber City, DLF Phase 2, Sector 24, Gurugram, Haryana 122002, India",
        latitude: 28.4967,
        longitude: 77.0903,
        source: "PLACES_AUTOCOMPLETE",
      };
      set({
        pickupLocation: defaultPickupLocation,
        destLocation: cyberHubLoc,
        searchQuery: {
          ...defaultQuery,
          origin_name: defaultPickupLocation.formatted_address,
          origin_lat: defaultPickupLocation.latitude,
          origin_lon: defaultPickupLocation.longitude,
          pickup: defaultPickupLocation,
          dest_name: cyberHubLoc.formatted_address,
          dest_lat: cyberHubLoc.latitude,
          dest_lon: cyberHubLoc.longitude,
          destination: cyberHubLoc,
          travel_time: "12:39",
          mode_preference: "all",
        },
        hasSearched: true,
        locationError: null,
      });
    }
    get().executeSearch();
  },

  // ── Live Ola Maps Traffic Data Fetch ─────────────────────────────────────
  fetchLiveGoogleData: async () => {
    const q = get().searchQuery;
    const oLat = get().pickupLocation?.latitude ?? q.origin_lat;
    const oLon = get().pickupLocation?.longitude ?? q.origin_lon;
    const dLat = get().destLocation?.latitude ?? q.dest_lat;
    const dLon = get().destLocation?.longitude ?? q.dest_lon;

    if (!oLat || !dLat || !oLon || !dLon) return;

    try {
      // Live traffic directions directly via Ola Maps Directions API
      const olaResult = await fetchOlaLiveDirections(oLat, oLon, dLat, dLon, "driving");
      if (olaResult) {
        set((state) => ({
          liveData: {
            ...state.liveData,
            olaMapsReady: true,
            googleMapsReady: true,
            lastFetchedAt: new Date().toLocaleTimeString("en-IN"),
            liveTravelTimeMin: Math.round(olaResult.durationSeconds / 60),
            liveTravelDistanceKm: parseFloat((olaResult.distanceMeters / 1000).toFixed(1)),
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
    const pLoc = get().pickupLocation;
    const dLoc = get().destLocation;

    const originName = pLoc?.formatted_address || query.origin_name;
    const destName = dLoc?.formatted_address || query.dest_name;

    if (!originName || !destName) {
      set({ hasSearched: false, searchResult: null });
      return;
    }

    const oLat = pLoc?.latitude ?? query.origin_lat;
    const oLon = pLoc?.longitude ?? query.origin_lon;
    const dLat = dLoc?.latitude ?? query.dest_lat;
    const dLon = dLoc?.longitude ?? query.dest_lon;

    // Strict coordinate validation
    if (
      oLat === undefined || oLon === undefined ||
      dLat === undefined || dLon === undefined ||
      isNaN(oLat) || isNaN(oLon) || isNaN(dLat) || isNaN(dLon) ||
      oLat < -90 || oLat > 90 || oLon < -180 || oLon > 180 ||
      dLat < -90 || dLat > 90 || dLon < -180 || dLon > 180
    ) {
      set({ locationError: "Please select valid pickup and destination locations with verified coordinates." });
      return;
    }

    const fullPayload: SearchRequest = {
      ...query,
      origin_name: originName,
      origin_lat: oLat,
      origin_lon: oLon,
      pickup: pLoc || undefined,
      dest_name: destName,
      dest_lat: dLat,
      dest_lon: dLon,
      destination: dLoc || undefined,
    };

    set({ isLoading: true, error: null, locationError: null, hasSearched: true });

    // Fire live Google Maps data fetch in parallel (non-blocking)
    get().fetchLiveGoogleData();

    try {
      // 1️⃣  Try live FastAPI backend with exact coordinates & formatted addresses
      const result = await searchRoutes(fullPayload);
      set({
        searchResult: result,
        isLoading: false,
        selectedRoute: result.routes.length > 0 ? result.routes[0] : null,
        liveData: { ...get().liveData, backendOnline: true },
        error: null,
      });
    } catch {
      // 2️⃣  Graceful fallback to sample transit network
      const fallbackResult = generateSampleRoutes(fullPayload);
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
