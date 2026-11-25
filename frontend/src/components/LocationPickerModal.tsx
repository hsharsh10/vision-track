import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  MapPin,
  Crosshair,
  Search,
  Check,
  Loader2,
  AlertCircle,
} from "lucide-react";
import L from "leaflet";
import { StandardizedLocation, LocationSource } from "../types";
import { locationService } from "../services/locationService";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  target: "origin" | "dest";
  initialLat?: number;
  initialLon?: number;
  onConfirmLocation: (target: "origin" | "dest", location: StandardizedLocation) => void;
}

export const LocationPickerModal: React.FC<Props> = ({
  isOpen,
  onClose,
  target,
  initialLat = 28.6139,
  initialLon = 77.209,
  onConfirmLocation,
}) => {
  const [activeTarget, setActiveTarget] = useState<"origin" | "dest">(target);
  const [selectedLocation, setSelectedLocation] = useState<StandardizedLocation | null>(null);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [isDraggingMap, setIsDraggingMap] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StandardizedLocation[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isGPSLoading, setIsGPSLoading] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [mapTheme, setMapTheme] = useState<"roadmap" | "satellite">("roadmap");

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reverseGeocodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isProgrammaticMoveRef = useRef(false);

  useEffect(() => {
    setActiveTarget(target);
  }, [target]);

  // ─── Reverse geocode coordinate update with debouncing ─────────────────────
  const updatePosition = useCallback(
    (lat: number, lon: number, source: LocationSource = "MAP_PIN") => {
      if (reverseGeocodeTimerRef.current) {
        clearTimeout(reverseGeocodeTimerRef.current);
      }

      setIsReverseGeocoding(true);
      setPickerError(null);

      // Immediately set coordinate fallback so user can confirm without waiting
      setSelectedLocation({
        name: `Selected Point (${lat.toFixed(4)}, ${lon.toFixed(4)})`,
        formatted_address: `Coordinates: ${lat.toFixed(6)}, ${lon.toFixed(6)}`,
        latitude: lat,
        longitude: lon,
        source,
      });

      // Debounce the actual reverse geocode API call
      reverseGeocodeTimerRef.current = setTimeout(async () => {
        try {
          const loc = await locationService.reverseGeocode(lat, lon, source);
          setSelectedLocation(loc);
        } catch {
          // Keep the coordinate fallback
        } finally {
          setIsReverseGeocoding(false);
        }
      }, 300);
    },
    []
  );

  // ─── Initialize Map ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      if (!mapContainerRef.current || mapInstanceRef.current) return;

      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLon],
        zoom: 15,
        zoomControl: false,
      });

      L.control.zoom({ position: "topright" }).addTo(map);

      // Clean crisp map tiles
      const getTileUrl = (theme: "roadmap" | "satellite") =>
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

      const tileLayer = L.tileLayer(getTileUrl(mapTheme), {
        subdomains: ["a", "b", "c", "d"],
        maxZoom: 20,
        attribution: "© Ola Maps",
      }).addTo(map);

      tileLayerRef.current = tileLayer;

      // Map move listeners for center pin interaction (Ola Maps / Uber style)
      map.on("movestart", () => {
        setIsDraggingMap(true);
        // Dismiss autocomplete dropdown when user starts panning the map
        setSearchResults([]);
      });

      map.on("move", () => {
        setIsDraggingMap(true);
      });

      map.on("moveend", () => {
        setIsDraggingMap(false);
        // If the movement was triggered programmatically (e.g. search flyTo), don't overwrite the searched location!
        if (isProgrammaticMoveRef.current) {
          isProgrammaticMoveRef.current = false;
          return;
        }
        const center = map.getCenter();
        updatePosition(center.lat, center.lng, "MAP_PIN");
      });

      // Map click pans that clicked spot smoothly to center
      map.on("click", (e: L.LeafletMouseEvent) => {
        setSearchResults([]);
        map.panTo(e.latlng, { animate: true, duration: 0.3 });
        updatePosition(e.latlng.lat, e.latlng.lng, "MAP_PIN");
      });

      mapInstanceRef.current = map;

      // Initial reverse geocode
      updatePosition(initialLat, initialLon, "MAP_PIN");
    }, 100);

    return () => {
      clearTimeout(timer);
      if (reverseGeocodeTimerRef.current) clearTimeout(reverseGeocodeTimerRef.current);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [isOpen, initialLat, initialLon, updatePosition]);

  // Invalidate map size on open/resize
  useEffect(() => {
    if (isOpen && mapInstanceRef.current) {
      setTimeout(() => {
        mapInstanceRef.current?.invalidateSize();
      }, 150);
    }
  }, [isOpen]);

  // Dynamically switch map layer
  useEffect(() => {
    if (tileLayerRef.current) {
      const url = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
      tileLayerRef.current.setUrl(url);
    }
  }, [mapTheme]);

  // ─── Direct Search Autocomplete ──────────────────────────────────────────
  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    // Clear any previous error immediately on user keystroke
    setPickerError(null);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    if (text.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const center = mapInstanceRef.current?.getCenter();
        const results = await locationService.searchPlaces(
          text,
          center?.lat,
          center?.lng
        );
        setSearchResults(results);
        if (results && results.length > 0) {
          setPickerError(null);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 250);
  };

  // ─── Navigate map to selected search result ──────────────────────────────
  const handleSelectSearchResult = (loc: StandardizedLocation) => {
    setSelectedLocation(loc);
    setSearchQuery(loc.formatted_address || loc.name);
    setSearchResults([]);
    setPickerError(null);

    if (mapInstanceRef.current) {
      isProgrammaticMoveRef.current = true;
      mapInstanceRef.current.flyTo([loc.latitude, loc.longitude], 16, {
        animate: true,
        duration: 0.8,
      });
    }
  };

  // ─── Search Form Submit (Enter key or Search button) ──────────────────────
  const handleSearchSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // 1. If we already have autocomplete matches, pick the top result
    if (searchResults.length > 0) {
      handleSelectSearchResult(searchResults[0]);
      return;
    }

    // 2. Otherwise trigger immediate live search
    setIsSearching(true);
    setPickerError(null);
    try {
      const center = mapInstanceRef.current?.getCenter();
      const results = await locationService.searchPlaces(query, center?.lat, center?.lng);
      if (results && results.length > 0) {
        handleSelectSearchResult(results[0]);
      } else {
        setPickerError(`No places found for "${query}". Try another landmark or drag the map.`);
      }
    } catch (err: any) {
      setPickerError(err.message || "Failed to search location. Please try again or drag the map.");
    } finally {
      setIsSearching(false);
    }
  };

  // ─── Current GPS Location ────────────────────────────────────────────────
  const handleGPSClick = async () => {
    setIsGPSLoading(true);
    setPickerError(null);
    try {
      const loc = await locationService.getCurrentPosition();
      setSelectedLocation(loc);
      setSearchQuery(loc.formatted_address || loc.name);

      if (mapInstanceRef.current) {
        isProgrammaticMoveRef.current = true;
        mapInstanceRef.current.flyTo([loc.latitude, loc.longitude], 16, {
          animate: true,
          duration: 0.8,
        });
      }
    } catch (err: any) {
      setPickerError(err.message || "Failed to retrieve current GPS location");
    } finally {
      setIsGPSLoading(false);
    }
  };

  // ─── Confirm Selection ────────────────────────────────────────────────────
  const handleConfirm = () => {
    if (!selectedLocation) return;
    onConfirmLocation(activeTarget, selectedLocation);
    onClose();
  };

  if (!isOpen) return null;

  const isOrigin = activeTarget === "origin";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl sm:rounded-3xl w-full max-w-4xl h-[94vh] sm:h-[86vh] max-h-[720px] overflow-hidden flex flex-col shadow-2xl border border-slate-200">
        
        {/* ── 1. Top Header Bar ────────────────────────────────────────────── */}
        <div className="px-4 sm:px-6 py-3 border-b border-slate-200 flex items-center justify-between gap-3 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center border ${
                isOrigin
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : "bg-rose-50 text-rose-800 border-rose-200"
              }`}
            >
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 m-0 flex items-center gap-2">
                <span>Choose Location on Ola Maps</span>
              </h2>
              <p className="text-[11px] text-slate-500 m-0 hidden sm:block">
                Search a place or drag the map to position the pin exactly
              </p>
            </div>
          </div>

          {/* Mode & Theme Switchers */}
          <div className="flex items-center gap-2">
            {/* Map Layer Switcher */}
            <div className="flex items-center p-0.5 bg-slate-100 rounded-xl border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setMapTheme("roadmap")}
                className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  mapTheme === "roadmap"
                    ? "bg-white text-slate-900 shadow-2xs font-bold"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                🗺️ Map
              </button>
              <button
                type="button"
                onClick={() => setMapTheme("satellite")}
                className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  mapTheme === "satellite"
                    ? "bg-white text-slate-900 shadow-2xs font-bold"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                🛰️ Satellite
              </button>
            </div>

            {/* Target Switcher */}
            <div className="flex items-center p-0.5 bg-slate-100 rounded-xl border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setActiveTarget("origin")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                  isOrigin
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-200 inline-block"></span>
                <span>Pickup</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTarget("dest")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                  !isOrigin
                    ? "bg-rose-600 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-rose-200 inline-block"></span>
                <span>Destination</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              title="Close picker"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── 2. Search on Map Input (z-50 guarantees dropdown floats over the map) ── */}
        <div className="relative px-4 py-2.5 bg-slate-50 border-b border-slate-200 shrink-0 z-50">
          <div className="relative max-w-xl mx-auto">
            <form
              onSubmit={handleSearchSubmit}
              className="relative flex items-center"
            >
              <Search className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSearchSubmit();
                  }
                }}
                placeholder="Search building, mall, station, street or landmark..."
                className="w-full bg-white border border-slate-300 focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 rounded-xl pl-9 pr-24 py-2 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none shadow-xs font-medium transition"
              />
              
              <div className="absolute right-1.5 flex items-center gap-1">
                {isSearching ? (
                  <Loader2 className="w-4 h-4 text-teal-600 animate-spin mr-1" />
                ) : searchQuery ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setSearchResults([]);
                      setPickerError(null);
                    }}
                    className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer rounded-full mr-0.5"
                    title="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                ) : null}

                <button
                  type="submit"
                  className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-xs transition"
                >
                  Search
                </button>
              </div>
            </form>

            {/* Autocomplete Search Dropdown - Perfectly aligned with input, floats above map */}
            {searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 max-h-64 overflow-y-auto divide-y divide-slate-100 ring-1 ring-slate-900/10">
                {searchResults.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectSearchResult(item)}
                    className="w-full text-left p-3 hover:bg-teal-50/70 transition flex items-start gap-3 cursor-pointer text-xs group"
                  >
                    <div className="w-7 h-7 rounded-lg bg-teal-50 group-hover:bg-teal-100 text-teal-700 flex items-center justify-center shrink-0 mt-0.5 transition">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-900 group-hover:text-teal-900 truncate">
                        {item.name}
                      </div>
                      <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                        {item.formatted_address}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Error notification only when no search results are showing */}
            {pickerError && searchResults.length === 0 && (
              <div className="mt-2 px-3 py-1.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center justify-between gap-2 shadow-xs">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-600" />
                  <span>{pickerError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPickerError(null)}
                  className="text-rose-400 hover:text-rose-700 p-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── 3. Map Canvas Container ─────────────────────────────────────── */}
        <div className="relative flex-1 w-full min-h-0 bg-slate-100 overflow-hidden">
          <div ref={mapContainerRef} className="w-full h-full" />

          {/* Center Pin Target: High visibility, stays centered above map tiles */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full pointer-events-none z-30 flex flex-col items-center">
            {/* Tooltip hint above pin */}
            <div
              className={`mb-1 px-3 py-1 rounded-full text-[10px] font-bold text-white shadow-xl transition-all duration-150 ring-2 ring-white ${
                isDraggingMap ? "opacity-0 scale-90" : "opacity-100 scale-100"
              } ${isOrigin ? "bg-emerald-600" : "bg-rose-600"}`}
            >
              {isOrigin ? "📍 Set Pickup Here" : "📍 Set Drop Here"}
            </div>

            {/* Pin Head */}
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-white shadow-2xl ring-3 ring-white transition-all duration-150 ${
                isDraggingMap
                  ? "-translate-y-3 scale-110 shadow-black/50"
                  : "translate-y-0 scale-100"
              } ${isOrigin ? "bg-emerald-600" : "bg-rose-600"}`}
            >
              <MapPin className="w-5 h-5 fill-white text-white drop-shadow-sm" />
            </div>

            {/* Pin Needle */}
            <div
              className={`w-1.5 h-3.5 -mt-0.5 rounded-b shadow-sm ${
                isOrigin ? "bg-emerald-700" : "bg-rose-700"
              }`}
            />

            {/* Pin Shadow on Ground */}
            <div
              className={`w-5 h-2 bg-black/50 rounded-full blur-[1px] transition-all duration-150 ${
                isDraggingMap
                  ? "scale-50 opacity-20 mt-3"
                  : "scale-100 opacity-80 mt-0.5"
              }`}
            />
          </div>

          {/* Floating Action: GPS Button */}
          <button
            type="button"
            onClick={handleGPSClick}
            disabled={isGPSLoading}
            title="Locate my GPS position"
            className="absolute bottom-4 right-4 z-30 bg-white hover:bg-slate-50 text-slate-700 px-3.5 py-2.5 rounded-2xl shadow-lg border border-slate-200 cursor-pointer transition flex items-center gap-2 text-xs font-semibold hover:shadow-xl active:scale-95"
          >
            {isGPSLoading ? (
              <Loader2 className="w-4 h-4 text-teal-700 animate-spin" />
            ) : (
              <Crosshair className="w-4 h-4 text-teal-700" />
            )}
            <span>Use My GPS</span>
          </button>
        </div>

        {/* ── 4. Dedicated Solid Bottom Footer (ALWAYS VISIBLE - NEVER CUT OFF) ── */}
        <div className="bg-white border-t border-slate-200 px-4 sm:px-6 py-3.5 shrink-0 shadow-lg z-30">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            
            {/* Address info */}
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block w-2.5 h-2.5 rounded-full ${
                    isOrigin ? "bg-emerald-500" : "bg-rose-500"
                  }`}
                />
                <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {isOrigin ? "Selected Pickup Location" : "Selected Destination"}
                </span>
                {selectedLocation && (
                  <span className="text-[10px] text-slate-400 font-mono hidden md:inline">
                    ({selectedLocation.latitude.toFixed(6)}, {selectedLocation.longitude.toFixed(6)})
                  </span>
                )}
              </div>

              {isReverseGeocoding ? (
                <div className="flex items-center gap-2 text-xs text-slate-500 py-0.5">
                  <Loader2 className="w-3.5 h-3.5 text-teal-700 animate-spin" />
                  <span className="font-medium">Pinpointing address…</span>
                </div>
              ) : (
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-bold text-slate-900 truncate" title={selectedLocation?.formatted_address || selectedLocation?.name}>
                    {selectedLocation?.formatted_address || selectedLocation?.name || "Move map to choose location"}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {selectedLocation ? `Place: ${selectedLocation.name} • Coordinates: ${selectedLocation.latitude.toFixed(6)}, ${selectedLocation.longitude.toFixed(6)}` : "Drag the map or click anywhere to select"}
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Location Button */}
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!selectedLocation || isReverseGeocoding}
              className={`w-full sm:w-auto px-6 py-3 rounded-xl text-white font-bold text-xs sm:text-sm shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 shrink-0 cursor-pointer disabled:opacity-50 active:scale-95 ${
                isOrigin
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-rose-600 hover:bg-rose-700"
              }`}
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Confirm {isOrigin ? "Pickup" : "Destination"}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
