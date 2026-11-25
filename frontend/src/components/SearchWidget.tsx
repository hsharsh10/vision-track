import React, { useState } from "react";
import {
  ArrowUpDown,
  Route,
  Train,
  Car,
  Layers,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Search,
  MessageSquare,
  Navigation,
  Copy,
  Check,
} from "lucide-react";
import { useMobilityStore } from "../store/mobilityStore";
import { TravelModeFilter, RoutePriority, StandardizedLocation } from "../types";
import { LocationSearchInput } from "./LocationSearchInput";

export const SearchWidget: React.FC = () => {
  const {
    searchQuery,
    setSearchQuery,
    pickupLocation,
    destLocation,
    setPickupLocation,
    setDestLocation,
    clearPickupLocation,
    clearDestLocation,
    openLocationPicker,
    swapLocations,
    executeSearch,
    isLoading,
    setModePreference,
    locationError,
  } = useMobilityStore();

  const [isLimitsOpen, setIsLimitsOpen] = useState(false);
  const [isCoordinatesOpen, setIsCoordinatesOpen] = useState(true);
  const [copiedCoord, setCopiedCoord] = useState<"pickup" | "dest" | null>(null);

  const handleCopyCoordinates = (type: "pickup" | "dest", lat: number, lon: number) => {
    const text = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    navigator.clipboard.writeText(text);
    setCopiedCoord(type);
    setTimeout(() => {
      setCopiedCoord(null);
    }, 2000);
  };

  const travelModes: {
    id: TravelModeFilter;
    title: string;
    subtitle: string;
    icon: any;
  }[] = [
    {
      id: "all",
      title: "All modes",
      subtitle: "Cabs, autos, metro, walking",
      icon: Route,
    },
    {
      id: "public_only",
      title: "Public transport",
      subtitle: "Metro and walking",
      icon: Train,
    },
    {
      id: "cab_auto_only",
      title: "Cab or auto",
      subtitle: "Ride-hailing only",
      icon: Car,
    },
    {
      id: "mixed",
      title: "Mixed",
      subtitle: "Metro combined with rides",
      icon: Layers,
    },
  ];

  return (
    <div className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-7 shadow-xs">
      {/* Title & Description */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 leading-snug m-0">
          Find the smartest way across the city
        </h1>
        <p className="text-slate-500 text-xs sm:text-sm mt-2 leading-relaxed m-0">
          Compare cabs, autos, metro and walking, then pick the option that fits your priorities.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          executeSearch();
        }}
        className="space-y-4"
      >
        {/* Dynamic Pickup Input */}
        <LocationSearchInput
          label="Pickup"
          placeholder="Search any address, landmark, building, or station"
          value={searchQuery.origin_name}
          location={pickupLocation}
          onChangeText={(text) => setSearchQuery({ origin_name: text })}
          onSelectLocation={(loc: StandardizedLocation) => setPickupLocation(loc)}
          onClearLocation={clearPickupLocation}
          onOpenMapPicker={() => openLocationPicker("origin")}
          isPickup={true}
          viewportLat={pickupLocation?.latitude || searchQuery.origin_lat}
          viewportLon={pickupLocation?.longitude || searchQuery.origin_lon}
        />

        {/* Swap Locations Button */}
        <div className="flex items-center justify-center -my-2 relative z-10">
          <button
            type="button"
            onClick={swapLocations}
            className="p-1.5 rounded-full bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-500 hover:text-slate-800 transition shadow-2xs cursor-pointer"
            title="Swap pickup and destination"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Dynamic Destination Input */}
        <LocationSearchInput
          label="Destination"
          placeholder="Where are you going? (Mall, office, airport, address)"
          value={searchQuery.dest_name}
          location={destLocation}
          onChangeText={(text) => setSearchQuery({ dest_name: text })}
          onSelectLocation={(loc: StandardizedLocation) => setDestLocation(loc)}
          onClearLocation={clearDestLocation}
          onOpenMapPicker={() => openLocationPicker("dest")}
          isPickup={false}
          viewportLat={destLocation?.latitude || searchQuery.dest_lat}
          viewportLon={destLocation?.longitude || searchQuery.dest_lon}
        />

        {/* ── Location Details & Exact Coordinates Panel (Section 4 & 5) ── */}
        <div className="bg-slate-50/80 rounded-2xl border border-slate-200/80 p-3 sm:p-3.5 space-y-2.5 transition">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setIsCoordinatesOpen(!isCoordinatesOpen)}
              className="flex items-center gap-2 text-xs font-bold text-slate-700 hover:text-teal-900 cursor-pointer"
            >
              <Navigation className="w-3.5 h-3.5 text-teal-600" />
              <span>Location Coordinates &amp; Full Addresses</span>
              {isCoordinatesOpen ? (
                <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              )}
            </button>
            <span className="text-[10px] text-teal-700 font-semibold bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
              Verified Geometry
            </span>
          </div>

          {isCoordinatesOpen && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
              {/* Pickup Location Details */}
              <div className="bg-white rounded-xl border border-slate-200 p-2.5 space-y-1.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                    Pickup Location
                  </span>
                  {pickupLocation && (
                    <button
                      type="button"
                      onClick={() => handleCopyCoordinates("pickup", pickupLocation.latitude, pickupLocation.longitude)}
                      className="text-[10px] text-slate-500 hover:text-slate-800 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-100 transition cursor-pointer"
                      title="Copy coordinates"
                    >
                      {copiedCoord === "pickup" ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span className="text-emerald-700 font-semibold">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-slate-400" />
                          <span>Copy coords</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                <div className="text-xs font-semibold text-slate-900 line-clamp-2" title={pickupLocation?.formatted_address || searchQuery.origin_name}>
                  {pickupLocation?.formatted_address || searchQuery.origin_name || "No pickup selected"}
                </div>

                {pickupLocation ? (
                  <div className="grid grid-cols-2 gap-1 text-[11px] font-mono bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                    <div>
                      <span className="text-slate-400 block text-[9px] font-sans uppercase">Latitude</span>
                      <span className="text-slate-800 font-semibold">{pickupLocation.latitude.toFixed(6)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px] font-sans uppercase">Longitude</span>
                      <span className="text-slate-800 font-semibold">{pickupLocation.longitude.toFixed(6)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-400 italic">Select a pickup location to view exact coordinates.</div>
                )}
              </div>

              {/* Destination Location Details */}
              <div className="bg-white rounded-xl border border-slate-200 p-2.5 space-y-1.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-rose-500 inline-block"></span>
                    Destination Location
                  </span>
                  {destLocation && (
                    <button
                      type="button"
                      onClick={() => handleCopyCoordinates("dest", destLocation.latitude, destLocation.longitude)}
                      className="text-[10px] text-slate-500 hover:text-slate-800 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-100 transition cursor-pointer"
                      title="Copy coordinates"
                    >
                      {copiedCoord === "dest" ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span className="text-emerald-700 font-semibold">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-slate-400" />
                          <span>Copy coords</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                <div className="text-xs font-semibold text-slate-900 line-clamp-2" title={destLocation?.formatted_address || searchQuery.dest_name}>
                  {destLocation?.formatted_address || searchQuery.dest_name || "No destination selected"}
                </div>

                {destLocation ? (
                  <div className="grid grid-cols-2 gap-1 text-[11px] font-mono bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                    <div>
                      <span className="text-slate-400 block text-[9px] font-sans uppercase">Latitude</span>
                      <span className="text-slate-800 font-semibold">{destLocation.latitude.toFixed(6)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px] font-sans uppercase">Longitude</span>
                      <span className="text-slate-800 font-semibold">{destLocation.longitude.toFixed(6)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-400 italic">Select a destination to view exact coordinates.</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Location Error alert if any */}
        {locationError && (
          <p className="text-rose-500 text-xs leading-snug m-0">{locationError}</p>
        )}

        {/* How do you want to travel? 2x2 Grid */}
        <div className="pt-2">
          <label className="text-xs font-semibold text-slate-700 block mb-2.5">
            How do you want to travel?
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            {travelModes.map((mode) => {
              const Icon = mode.icon;
              const isSelected = searchQuery.mode_preference === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setModePreference(mode.id)}
                  className={`text-left p-3 rounded-2xl border transition cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? "border-2 border-teal-600 bg-teal-50/50 shadow-xs"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 ${
                      isSelected ? "text-teal-700" : "text-slate-500"
                    }`}
                  />
                  <div className="mt-2.5">
                    <div
                      className={`font-semibold text-xs leading-snug ${
                        isSelected ? "text-teal-950 font-bold" : "text-slate-900"
                      }`}
                    >
                      {mode.title}
                    </div>
                    <div className="text-[10px] text-slate-500 leading-tight mt-0.5">
                      {mode.subtitle}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Collapsible: Travel limits and priorities */}
        <div className="pt-2">
          <div
            onClick={() => setIsLimitsOpen(!isLimitsOpen)}
            className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 transition cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
              <span>Travel limits and priorities</span>
            </div>
            {isLimitsOpen ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </div>

          {/* Expanded Limits & Settings */}
          {isLimitsOpen && (
            <div className="mt-2.5 p-3.5 bg-slate-50/80 border border-slate-200/80 rounded-2xl space-y-3.5 text-xs">
              {/* Ranking Priority */}
              <div>
                <span className="font-semibold text-slate-700 block mb-1.5">
                  Recommendation Priority:
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      ["best_overall", "Best Overall"],
                      ["fastest", "Fastest"],
                      ["cheapest", "Cheapest"],
                      ["comfortable", "Comfortable"],
                    ] as [RoutePriority, string][]
                  ).map(([pId, pLabel]) => (
                    <button
                      key={pId}
                      type="button"
                      onClick={() =>
                        setSearchQuery({ priority: pId as RoutePriority })
                      }
                      className={`px-2.5 py-1.5 rounded-lg border text-center transition ${
                        searchQuery.priority === pId
                          ? "bg-teal-700 text-white border-teal-700 font-semibold"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {pLabel}
                    </button>
                  ))}
                </div>
              </div>

              {/* Max Walking Slider */}
              <div>
                <div className="flex justify-between font-semibold text-slate-700 mb-1">
                  <span>Max Walking:</span>
                  <span className="text-teal-700 font-mono">
                    {searchQuery.max_walking_meters} m
                  </span>
                </div>
                <input
                  type="range"
                  min="300"
                  max="3500"
                  step="100"
                  value={searchQuery.max_walking_meters}
                  onChange={(e) =>
                    setSearchQuery({ max_walking_meters: Number(e.target.value) })
                  }
                  className="w-full accent-teal-700"
                />
              </div>

              {/* Concessions */}
              <div className="pt-2 border-t border-slate-200/80 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={searchQuery.has_smart_card}
                    onChange={(e) =>
                      setSearchQuery({ has_smart_card: e.target.checked })
                    }
                    className="accent-teal-700 rounded"
                  />
                  <span className="text-slate-700 text-[11px]">
                    DMRC Smart Card (10% token discount)
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={searchQuery.pink_pass}
                    onChange={(e) =>
                      setSearchQuery({ pink_pass: e.target.checked })
                    }
                    className="accent-teal-700 rounded"
                  />
                  <span className="text-slate-700 text-[11px]">
                    DTC Pink Pass (Zero-fare bus for women)
                  </span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Primary Submit Button: Compare routes */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-[#005f56] hover:bg-[#004d46] text-white font-semibold py-3 px-5 rounded-xl flex items-center justify-center gap-2 shadow-sm transition cursor-pointer disabled:opacity-60"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Search className="w-4 h-4 text-white" />
                <span>Compare routes</span>
              </>
            )}
          </button>
        </div>

        {/* Bottom Disclaimer */}
        <div className="pt-2 flex items-center gap-2 text-[11px] text-slate-400">
          <MessageSquare className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>Dynamic routing across any address, landmark, building, and coordinate.</span>
        </div>
      </form>
    </div>
  );
};
