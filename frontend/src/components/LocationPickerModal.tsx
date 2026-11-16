import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  MapPin,
  Crosshair,
  Search,
  Check,
  Loader2,
  AlertCircle,
  Navigation,
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

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reverseGeocodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      }, 350);
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

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);

      // Map move listeners for center pin interaction (Google Maps / Uber style)
      map.on("movestart", () => {
        setIsDraggingMap(true);
      });

      map.on("move", () => {
        setIsDraggingMap(true);
      });

      map.on("moveend", () => {
        setIsDraggingMap(false);
        const center = map.getCenter();
        updatePosition(center.lat, center.lng, "MAP_PIN");
      });

      // Map click pans that clicked spot smoothly to center
      map.on("click", (e: L.LeafletMouseEvent) => {
        map.panTo(e.latlng, { animate: true, duration: 0.4 });
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

  // ─── Direct Search Autocomplete ──────────────────────────────────────────
  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
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
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 280);
  };

  const handleSelectSearchResult = (loc: StandardizedLocation) => {
    setSelectedLocation(loc);
    setSearchQuery("");
    setSearchResults([]);

    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([loc.latitude, loc.longitude], 16, { duration: 0.8 });
    }
  };

  // ─── Current GPS Location ────────────────────────────────────────────────
  const handleGPSClick = async () => {
    setIsGPSLoading(true);
    setPickerError(null);
    try {
      const loc = await locationService.getCurrentPosition();
      setSelectedLocation(loc);

      if (mapInstanceRef.current) {
        mapInstanceRef.current.flyTo([loc.latitude, loc.longitude], 16, { duration: 0.8 });
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
              <h2 className="text-sm sm:text-base font-bold text-slate-900 m-0">
                Choose Location on Map
              </h2>
              <p className="text-[11px] text-slate-500 m-0 hidden sm:block">
                Drag the map to place the pin, or click anywhere to select that location
              </p>
            </div>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center gap-2">
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

        {/* ── 2. Search on Map Input ──────────────────────────────────────── */}
        <div className="relative px-4 py-2.5 bg-slate-50 border-b border-slate-200 shrink-0 z-20">
          <div className="relative flex items-center max-w-xl mx-auto">
            <Search className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search building, mall, station, street or landmark..."
              className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-9 py-2 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600 shadow-2xs font-medium"
            />
            {isSearching ? (
              <Loader2 className="absolute right-3 w-4 h-4 text-teal-600 animate-spin" />
            ) : searchQuery ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSearchResults([]);
                }}
                className="absolute right-3 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            ) : null}
          </div>

          {/* Autocomplete Search Dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute left-4 right-4 max-w-xl mx-auto top-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 max-h-60 overflow-y-auto divide-y divide-slate-100 ring-1 ring-slate-900/10">
              {searchResults.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectSearchResult(item)}
                  className="w-full text-left p-3 hover:bg-teal-50/70 transition flex items-start gap-2.5 cursor-pointer text-xs group"
                >
                  <MapPin className="w-4 h-4 text-teal-700 shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-slate-900 group-hover:text-teal-900 truncate">
                      {item.name}
                    </div>
                    <div className="text-[11px] text-slate-500 line-clamp-1">
                      {item.formatted_address}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Error notification if any */}
        {pickerError && (
          <div className="px-4 py-2 bg-rose-50 border-b border-rose-200 text-rose-700 text-xs flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{pickerError}</span>
          </div>
        )}

        {/* ── 3. Map Canvas Container ─────────────────────────────────────── */}
        <div className="relative flex-1 w-full min-h-0 bg-slate-100 overflow-hidden">
          <div ref={mapContainerRef} className="w-full h-full" />

          {/* Center Pin Target for Google Maps / Uber-like Location Picking */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full pointer-events-none z-30 flex flex-col items-center">
            {/* Tooltip hint above pin */}
            <div
              className={`mb-1 px-2.5 py-1 rounded-full text-[10px] font-bold text-white shadow-md transition-opacity duration-150 ${
                isDraggingMap ? "opacity-0" : "opacity-100"
              } ${isOrigin ? "bg-emerald-700" : "bg-rose-700"}`}
            >
              {isOrigin ? "📍 Set Pickup Here" : "📍 Set Drop Here"}
            </div>

            {/* Pin Head */}
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-white shadow-2xl ring-3 ring-white transition-all duration-150 ${
                isDraggingMap
                  ? "-translate-y-3 scale-110 shadow-black/40"
                  : "translate-y-0 scale-100"
              } ${isOrigin ? "bg-emerald-600" : "bg-rose-600"}`}
            >
              <MapPin className="w-5 h-5 fill-white text-white" />
            </div>

            {/* Pin Needle */}
            <div
              className={`w-1 h-3 -mt-0.5 rounded-b ${
                isOrigin ? "bg-emerald-700" : "bg-rose-700"
              }`}
            />

            {/* Pin Shadow on Ground */}
            <div
              className={`w-4 h-1.5 bg-black/40 rounded-full blur-[1px] transition-all duration-150 ${
                isDraggingMap
                  ? "scale-50 opacity-20 mt-3"
                  : "scale-100 opacity-70 mt-0.5"
              }`}
            />
          </div>

          {/* Floating Action: GPS Button */}
          <button
            type="button"
            onClick={handleGPSClick}
            disabled={isGPSLoading}
            title="Locate my GPS position"
            className="absolute bottom-4 right-4 z-20 bg-white hover:bg-slate-50 text-slate-700 px-3.5 py-2.5 rounded-2xl shadow-lg border border-slate-200 cursor-pointer transition flex items-center gap-2 text-xs font-semibold hover:shadow-xl active:scale-95"
          >
            {isGPSLoading ? (
              <Loader2 className="w-4 h-4 text-teal-700 animate-spin" />
            ) : (
              <Crosshair className="w-4 h-4 text-teal-700" />
            )}
            <span>{isGPSLoading ? "Locking GPS..." : "Use My GPS"}</span>
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
                    ({selectedLocation.latitude.toFixed(4)}, {selectedLocation.longitude.toFixed(4)})
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
                  <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                    {selectedLocation?.name || "Move map to choose location"}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {selectedLocation?.formatted_address || "Drag the map or click anywhere to select"}
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
