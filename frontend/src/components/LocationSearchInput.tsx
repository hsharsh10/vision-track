import React, { useState, useEffect, useRef } from "react";
import {
  MapPin,
  Search,
  Crosshair,
  Map,
  X,
  Clock,
  Home,
  Briefcase,
  Star,
  Train,
  Plane,
  Building2,
  Store,
  Loader2,
  Check,
  AlertCircle,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { StandardizedLocation, LocationSource } from "../types";
import { locationService } from "../services/locationService";

const POPULAR_HUBS: StandardizedLocation[] = [
  {
    name: "Connaught Place (Rajiv Chowk)",
    formatted_address: "Connaught Place, New Delhi, Delhi 110001",
    latitude: 28.6328,
    longitude: 77.2197,
    source: "PLACES_AUTOCOMPLETE",
  },
  {
    name: "DLF Cyber City, Gurugram",
    formatted_address: "DLF Phase 2, Sector 24, Gurugram, Haryana 122002",
    latitude: 28.4952,
    longitude: 77.0894,
    source: "PLACES_AUTOCOMPLETE",
  },
  {
    name: "Noida Sector 18 (Atta Market)",
    formatted_address: "Sector 18, Noida, Uttar Pradesh 201301",
    latitude: 28.5708,
    longitude: 77.3261,
    source: "PLACES_AUTOCOMPLETE",
  },
  {
    name: "AIIMS New Delhi",
    formatted_address: "Sri Aurobindo Marg, Ansari Nagar, New Delhi 110029",
    latitude: 28.5672,
    longitude: 77.2100,
    source: "PLACES_AUTOCOMPLETE",
  },
  {
    name: "IGI Airport Terminal 3",
    formatted_address: "Indira Gandhi International Airport, New Delhi 110037",
    latitude: 28.5562,
    longitude: 77.0999,
    source: "PLACES_AUTOCOMPLETE",
  },
  {
    name: "Anand Vihar ISBT",
    formatted_address: "Anand Vihar Inter-State Bus Terminus, Delhi 110092",
    latitude: 28.6469,
    longitude: 77.3160,
    source: "PLACES_AUTOCOMPLETE",
  },
];

interface Props {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  onSelectLocation: (location: StandardizedLocation) => void;
  onOpenMapPicker: () => void;
  isPickup?: boolean;
  viewportLat?: number;
  viewportLon?: number;
}

export const LocationSearchInput: React.FC<Props> = ({
  label,
  placeholder,
  value,
  onChangeText,
  onSelectLocation,
  onOpenMapPicker,
  isPickup = false,
  viewportLat,
  viewportLon,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<StandardizedLocation[]>([]);
  const [recentLocations, setRecentLocations] = useState<StandardizedLocation[]>([]);
  const [savedPlaces, setSavedPlaces] = useState<{ home?: StandardizedLocation; work?: StandardizedLocation }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isGPSLoading, setIsGPSLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load recents & saved on mount
  useEffect(() => {
    setRecentLocations(locationService.getRecentLocations());
    setSavedPlaces(locationService.getSavedPlaces());
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ─── Debounced Autocomplete Fetch ─────────────────────────────────────────
  const handleInputChange = (text: string) => {
    onChangeText(text);
    setGpsError(null);

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    if (text.trim().length < 1) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setIsOpen(true);

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const results = await locationService.searchPlaces(
          text,
          viewportLat,
          viewportLon
        );
        setSuggestions(results);
      } catch {
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    }, 260);
  };

  // ─── GPS "Use Current Location" ───────────────────────────────────────────
  const handleUseGPS = async () => {
    setIsGPSLoading(true);
    setGpsError(null);
    try {
      const loc = await locationService.getCurrentPosition();
      onSelectLocation(loc);
      setIsOpen(false);
      setRecentLocations(locationService.getRecentLocations());
    } catch (err: any) {
      setGpsError(err.message || "Failed to retrieve location.");
    } finally {
      setIsGPSLoading(false);
    }
  };

  const handleSelect = (loc: StandardizedLocation) => {
    locationService.saveRecentLocation(loc);
    setRecentLocations(locationService.getRecentLocations());
    onSelectLocation(loc);
    setIsOpen(false);
    setSuggestions([]);
  };

  // Category Icon helper
  const getCategoryIcon = (loc: StandardizedLocation) => {
    const addr = (loc.formatted_address || "").toLowerCase();
    const name = (loc.name || "").toLowerCase();

    if (name.includes("metro") || addr.includes("metro") || name.includes("station")) {
      return <Train className="w-4 h-4 text-blue-600 shrink-0" />;
    }
    if (name.includes("airport") || addr.includes("airport") || name.includes("igi")) {
      return <Plane className="w-4 h-4 text-indigo-600 shrink-0" />;
    }
    if (name.includes("mall") || name.includes("market") || name.includes("plaza")) {
      return <Store className="w-4 h-4 text-amber-600 shrink-0" />;
    }
    if (name.includes("hospital") || name.includes("aiims") || name.includes("apollo")) {
      return <Building2 className="w-4 h-4 text-rose-600 shrink-0" />;
    }
    return <MapPin className="w-4 h-4 text-teal-600 shrink-0" />;
  };

  return (
    <div
      ref={containerRef}
      className={`space-y-1.5 relative ${isOpen ? "z-50" : isPickup ? "z-30" : "z-20"}`}
    >
      {/* Label & Action buttons */}
      <div className="flex items-center justify-between text-xs">
        <label className="font-semibold text-slate-700 flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full inline-block ${
              isPickup ? "bg-emerald-500" : "bg-rose-500"
            }`}
          />
          <span>{label}</span>
        </label>

        <div className="flex items-center gap-2">
          {/* Pick on Map button */}
          <button
            type="button"
            onClick={onOpenMapPicker}
            className="text-teal-700 hover:text-teal-900 font-medium inline-flex items-center gap-1 hover:underline cursor-pointer"
          >
            <Map className="w-3.5 h-3.5" />
            <span>Pick on Map</span>
          </button>
        </div>
      </div>

      {/* Input Field */}
      <div className="relative flex items-center">
        <div className="absolute left-3.5 text-slate-400 pointer-events-none">
          <MapPin className={`w-4 h-4 ${isPickup ? "text-emerald-600" : "text-rose-500"}`} />
        </div>

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-16 py-2.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600 transition shadow-2xs font-medium"
        />

        {/* Right Action Icons: Spinner, Clear Button, GPS */}
        <div className="absolute right-2.5 flex items-center gap-1 text-slate-400">
          {isLoading && <Loader2 className="w-4 h-4 text-teal-600 animate-spin" />}

          {value && !isLoading && (
            <button
              type="button"
              onClick={() => {
                onChangeText("");
                setSuggestions([]);
                inputRef.current?.focus();
              }}
              className="p-1 text-slate-400 hover:text-slate-600 transition cursor-pointer"
              title="Clear input"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {isPickup && (
            <button
              type="button"
              onClick={handleUseGPS}
              disabled={isGPSLoading}
              title="Use current GPS location"
              className="p-1 rounded-lg hover:bg-teal-50 text-teal-700 transition cursor-pointer"
            >
              {isGPSLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-teal-700" />
              ) : (
                <Crosshair className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Error message */}
      {gpsError && (
        <div className="flex items-center gap-1.5 text-rose-600 text-[11px] pt-0.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{gpsError}</span>
        </div>
      )}

      {/* ── Dropdown Suggestions Menu ────────────────────────────────────── */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden divide-y divide-slate-100 max-h-96 overflow-y-auto ring-1 ring-slate-900/10">
          {/* Header */}
          <div className="px-3.5 py-2 bg-slate-50 flex items-center justify-between text-[10px] font-bold tracking-wider text-slate-500 uppercase">
            <span>{suggestions.length > 0 ? `Search Results (${suggestions.length})` : "Quick Select Hubs"}</span>
            <span className="text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200 font-semibold tracking-normal normal-case">
              Google Places Active
            </span>
          </div>

          {/* Quick Option 1: Use Current Location (for pickup) */}
          {isPickup && (
            <button
              type="button"
              onClick={handleUseGPS}
              disabled={isGPSLoading}
              className="w-full text-left p-3 hover:bg-teal-50/70 transition flex items-center gap-3 cursor-pointer text-xs font-semibold text-teal-800 bg-teal-50/30"
            >
              <div className="w-7 h-7 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center shrink-0">
                {isGPSLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-teal-700" />
                ) : (
                  <Crosshair className="w-4 h-4" />
                )}
              </div>
              <div className="min-w-0">
                <div>Use my current location</div>
                <div className="text-[10px] text-teal-600 font-normal">
                  Accurate GPS detection with reverse geocoding
                </div>
              </div>
            </button>
          )}

          {/* Quick Option 2: Pick on interactive map */}
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onOpenMapPicker();
            }}
            className="w-full text-left p-2.5 px-3.5 hover:bg-slate-50 transition flex items-center gap-3 cursor-pointer text-xs font-medium text-slate-700"
          >
            <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
              <Map className="w-4 h-4 text-slate-600" />
            </div>
            <span>Choose on Map / Drop pin</span>
          </button>

          {/* Autocomplete Results */}
          {suggestions.length > 0 && (
            <div className="py-1 bg-white">
              {suggestions.map((loc, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelect(loc)}
                  className="w-full text-left px-3.5 py-2.5 hover:bg-teal-50/60 transition flex items-start gap-3 cursor-pointer text-xs group"
                >
                  <div className="mt-0.5">{getCategoryIcon(loc)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-slate-900 group-hover:text-teal-900 truncate">
                      {loc.name}
                    </div>
                    <div className="text-[11px] text-slate-500 line-clamp-1">
                      {loc.formatted_address}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Popular Hubs (when no active text search results) */}
          {suggestions.length === 0 && (
            <div className="py-1 bg-white divide-y divide-slate-50">
              {POPULAR_HUBS.map((hub, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelect(hub)}
                  className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 transition flex items-center justify-between gap-3 cursor-pointer text-xs group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <MapPin className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                    <span className="font-medium text-slate-800 group-hover:text-teal-900 truncate">
                      {hub.name}
                    </span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 shrink-0" />
                </button>
              ))}
            </div>
          )}

          {/* No results message */}
          {value.trim().length >= 2 && !isLoading && suggestions.length === 0 && (
            <div className="p-4 text-center text-xs text-slate-400 space-y-1 bg-white">
              <p className="font-medium m-0">No matching locations found for "{value}"</p>
              <p className="text-[11px] text-slate-400 m-0">
                Try searching a different landmark or choose directly on the map.
              </p>
            </div>
          )}

          {/* Recent Searches */}
          {recentLocations.length > 0 && (
            <div className="py-1 bg-white">
              <div className="px-3.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>Recent Searches</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    locationService.clearRecentLocations();
                    setRecentLocations([]);
                  }}
                  className="text-[10px] font-normal text-slate-400 hover:text-slate-600"
                >
                  Clear
                </button>
              </div>
              {recentLocations.slice(0, 3).map((rec, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelect(rec)}
                  className="w-full text-left px-3.5 py-2 hover:bg-slate-50 transition flex items-center gap-2.5 cursor-pointer text-xs"
                >
                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-800 truncate">{rec.name}</div>
                    <div className="text-[10px] text-slate-400 truncate">{rec.formatted_address}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Attribution footer */}
          <div className="px-3.5 py-1.5 bg-slate-50 text-[9px] text-slate-400 flex items-center justify-between">
            <span>Dynamic search (English &amp; Hindi)</span>
            <span>OSM / Google Places</span>
          </div>
        </div>
      )}
    </div>
  );
};
