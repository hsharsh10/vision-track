import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  MapPin,
  Crosshair,
  Search,
  Check,
  Loader2,
  Navigation,
  Globe,
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
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StandardizedLocation[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isGPSLoading, setIsGPSLoading] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setActiveTarget(target);
  }, [target]);

  // ─── Reverse geocode coordinate update ───────────────────────────────────
  const updatePosition = useCallback(
    async (lat: number, lon: number, source: LocationSource = "MAP_PIN") => {
      setIsReverseGeocoding(true);
      setPickerError(null);
      try {
        const loc = await locationService.reverseGeocode(lat, lon, source);
        setSelectedLocation(loc);
      } catch (err: any) {
        setSelectedLocation({
          name: `Point (${lat.toFixed(4)}, ${lon.toFixed(4)})`,
          formatted_address: `Coordinates: ${lat.toFixed(6)}, ${lon.toFixed(6)}`,
          latitude: lat,
          longitude: lon,
          source,
        });
      } finally {
        setIsReverseGeocoding(false);
      }
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
        zoom: 14,
        zoomControl: false,
      });

      L.control.zoom({ position: "topright" }).addTo(map);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);

      // Custom marker icon
      const createIcon = (isOrigin: boolean) =>
        L.divIcon({
          className: "custom-picker-pin",
          html: `
            <div style="position:relative; width:36px; height:36px; display:flex; align-items:center; justify-content:center;">
              <div style="width:28px; height:28px; border-radius:50%; background:${
                isOrigin ? "#10B981" : "#EF4444"
              }; border:3px solid #ffffff; box-shadow:0 4px 12px rgba(0,0,0,0.3); display:flex; align-items:center; justify-content:center;">
                <div style="width:8px; height:8px; border-radius:50%; background:#ffffff;"></div>
              </div>
              <div style="position:absolute; bottom:-6px; left:14px; width:0; height:0; border-left:4px solid transparent; border-right:4px solid transparent; border-top:8px solid ${
                isOrigin ? "#10B981" : "#EF4444"
              };"></div>
            </div>
          `,
          iconSize: [36, 42],
          iconAnchor: [18, 40],
        });

      const marker = L.marker([initialLat, initialLon], {
        draggable: true,
        icon: createIcon(activeTarget === "origin"),
      }).addTo(map);

      // Drag listener
      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        updatePosition(pos.lat, pos.lng, "MAP_PIN");
      });

      // Map click listener
      map.on("click", (e: L.LeafletMouseEvent) => {
        marker.setLatLng(e.latlng);
        updatePosition(e.latlng.lat, e.latlng.lng, "MAP_PIN");
      });

      mapInstanceRef.current = map;
      markerRef.current = marker;

      // Initial reverse geocode
      updatePosition(initialLat, initialLon, "MAP_PIN");
    }, 100);

    return () => {
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
      }
    };
  }, [isOpen, initialLat, initialLon, updatePosition]);

  // Update marker icon when activeTarget changes
  useEffect(() => {
    if (!markerRef.current) return;
    const isOrigin = activeTarget === "origin";
    markerRef.current.setIcon(
      L.divIcon({
        className: "custom-picker-pin",
        html: `
          <div style="position:relative; width:36px; height:36px; display:flex; align-items:center; justify-content:center;">
            <div style="width:28px; height:28px; border-radius:50%; background:${
              isOrigin ? "#10B981" : "#EF4444"
            }; border:3px solid #ffffff; box-shadow:0 4px 12px rgba(0,0,0,0.3); display:flex; align-items:center; justify-content:center;">
              <div style="width:8px; height:8px; border-radius:50%; background:#ffffff;"></div>
            </div>
            <div style="position:absolute; bottom:-6px; left:14px; width:0; height:0; border-left:4px solid transparent; border-right:4px solid transparent; border-top:8px solid ${
              isOrigin ? "#10B981" : "#EF4444"
            };"></div>
          </div>
        `,
        iconSize: [36, 42],
        iconAnchor: [18, 40],
      })
    );
  }, [activeTarget]);

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
    setSearchResults([]);
    setSearchQuery("");
    setSelectedLocation(loc);

    if (mapInstanceRef.current && markerRef.current) {
      mapInstanceRef.current.flyTo([loc.latitude, loc.longitude], 16, { duration: 1.2 });
      markerRef.current.setLatLng([loc.latitude, loc.longitude]);
    }
  };

  // ─── Current GPS Location ────────────────────────────────────────────────
  const handleGPSClick = async () => {
    setIsGPSLoading(true);
    setPickerError(null);
    try {
      const loc = await locationService.getCurrentPosition();
      setSelectedLocation(loc);

      if (mapInstanceRef.current && markerRef.current) {
        mapInstanceRef.current.flyTo([loc.latitude, loc.longitude], 16, { duration: 1.2 });
        markerRef.current.setLatLng([loc.latitude, loc.longitude]);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl w-full max-w-4xl h-[92vh] max-h-[820px] overflow-hidden flex flex-col shadow-2xl border border-slate-200">
        {/* Header Bar */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-800 flex items-center justify-center border border-teal-200">
              <MapPin className="w-4 h-4 text-teal-700" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 m-0">
                Interactive Location Picker
              </h2>
              <p className="text-[11px] text-slate-500 m-0 hidden sm:block">
                Drag the marker or click anywhere on the map to pinpoint any building, landmark, or address
              </p>
            </div>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center p-0.5 bg-slate-100 rounded-xl border border-slate-200 text-xs">
            <button
              onClick={() => setActiveTarget("origin")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                activeTarget === "origin"
                  ? "bg-emerald-600 text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-200 inline-block"></span>
              <span>Pickup</span>
            </button>
            <button
              onClick={() => setActiveTarget("dest")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                activeTarget === "dest"
                  ? "bg-rose-600 text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-200 inline-block"></span>
              <span>Destination</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search on Map Input */}
        <div className="relative px-4 py-2.5 bg-slate-50 border-b border-slate-200 shrink-0">
          <div className="relative flex items-center max-w-xl mx-auto">
            <Search className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search building, mall, station, street or address..."
              className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-9 py-2 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600 shadow-2xs"
            />
            {isSearching ? (
              <Loader2 className="absolute right-3 w-4 h-4 text-teal-600 animate-spin" />
            ) : searchQuery ? (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSearchResults([]);
                }}
                className="absolute right-3 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            ) : null}
          </div>

          {/* Autocomplete Search Dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute left-4 right-4 max-w-xl mx-auto top-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 max-h-60 overflow-y-auto divide-y divide-slate-100">
              {searchResults.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectSearchResult(item)}
                  className="w-full text-left p-3 hover:bg-teal-50/60 transition flex items-start gap-2.5 cursor-pointer text-xs"
                >
                  <MapPin className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-slate-800">{item.name}</div>
                    <div className="text-[11px] text-slate-500 line-clamp-1">{item.formatted_address}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Error notification if any */}
        {pickerError && (
          <div className="px-4 py-2 bg-rose-50 border-b border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{pickerError}</span>
          </div>
        )}

        {/* Map Canvas */}
        <div className="relative flex-1 w-full min-h-0 bg-slate-100">
          <div ref={mapContainerRef} className="w-full h-full" />

          {/* Floating GPS Button */}
          <button
            onClick={handleGPSClick}
            disabled={isGPSLoading}
            title="Locate my GPS position"
            className="absolute bottom-28 right-4 z-40 bg-white hover:bg-slate-50 text-slate-700 p-3 rounded-2xl shadow-md border border-slate-200 cursor-pointer transition flex items-center gap-2 text-xs font-semibold"
          >
            {isGPSLoading ? (
              <Loader2 className="w-4 h-4 text-teal-700 animate-spin" />
            ) : (
              <Crosshair className="w-4 h-4 text-teal-700" />
            )}
            <span className="hidden sm:inline">My Location</span>
          </button>

          {/* Floating Bottom Card: Address & Confirmation */}
          <div className="absolute bottom-4 left-4 right-4 z-40 max-w-xl mx-auto bg-white/95 backdrop-blur-md rounded-2xl p-4 border border-slate-200 shadow-xl space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block w-2.5 h-2.5 rounded-full ${
                      activeTarget === "origin" ? "bg-emerald-500" : "bg-rose-500"
                    }`}
                  />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    {activeTarget === "origin" ? "Selected Pickup" : "Selected Destination"}
                  </span>
                  {selectedLocation && (
                    <span className="text-[10px] text-slate-400 font-mono">
                      {selectedLocation.latitude.toFixed(4)}, {selectedLocation.longitude.toFixed(4)}
                    </span>
                  )}
                </div>

                {isReverseGeocoding ? (
                  <div className="flex items-center gap-2 text-xs text-slate-500 py-1">
                    <Loader2 className="w-3.5 h-3.5 text-teal-700 animate-spin" />
                    <span>Resolving address…</span>
                  </div>
                ) : (
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 truncate m-0">
                      {selectedLocation?.name || "Drop pin on map"}
                    </h3>
                    <p className="text-xs text-slate-500 line-clamp-1 m-0 mt-0.5">
                      {selectedLocation?.formatted_address || "Click anywhere or drag marker"}
                    </p>
                  </div>
                )}
              </div>

              {/* Confirm Button */}
              <button
                onClick={handleConfirm}
                disabled={!selectedLocation || isReverseGeocoding}
                className={`px-5 py-2.5 rounded-xl text-white font-bold text-xs sm:text-sm shadow-md transition flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50 ${
                  activeTarget === "origin"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-rose-600 hover:bg-rose-700"
                }`}
              >
                <Check className="w-4 h-4" />
                <span>Confirm {activeTarget === "origin" ? "Pickup" : "Drop"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
