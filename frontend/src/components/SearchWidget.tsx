import React, { useState } from "react";
import {
  ArrowUpDown,
  Calendar,
  Clock,
  Users,
  Route,
  Train,
  Car,
  Layers,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Search,
  MessageSquare,
} from "lucide-react";
import { useMobilityStore } from "../store/mobilityStore";
import { TravelModeFilter, RoutePriority, StandardizedLocation } from "../types";
import { LocationSearchInput } from "./LocationSearchInput";

export const SearchWidget: React.FC = () => {
  const {
    searchQuery,
    setSearchQuery,
    setPickupLocation,
    setDestLocation,
    openLocationPicker,
    swapLocations,
    executeSearch,
    isLoading,
    setModePreference,
    locationError,
  } = useMobilityStore();

  const [isLimitsOpen, setIsLimitsOpen] = useState(false);

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
          onChangeText={(text) => setSearchQuery({ origin_name: text })}
          onSelectLocation={(loc: StandardizedLocation) => setPickupLocation(loc)}
          onOpenMapPicker={() => openLocationPicker("origin")}
          isPickup={true}
          viewportLat={searchQuery.origin_lat}
          viewportLon={searchQuery.origin_lon}
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
          onChangeText={(text) => setSearchQuery({ dest_name: text })}
          onSelectLocation={(loc: StandardizedLocation) => setDestLocation(loc)}
          onOpenMapPicker={() => openLocationPicker("dest")}
          isPickup={false}
          viewportLat={searchQuery.dest_lat}
          viewportLon={searchQuery.dest_lon}
        />

        {/* Location Error alert if any */}
        {locationError && (
          <p className="text-rose-500 text-xs leading-snug m-0">{locationError}</p>
        )}

        {/* Date & Departure Row */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          {/* Date */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>Date</span>
            </label>
            <div className="relative flex items-center">
              <input
                type="text"
                value={searchQuery.travel_date || "12-11-2026"}
                onChange={(e) => setSearchQuery({ travel_date: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-800 focus:outline-none focus:border-teal-600 shadow-2xs"
              />
              <div className="absolute right-3 text-slate-400 pointer-events-none">
                <Calendar className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>

          {/* Departure */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 block">
              Departure
            </label>
            <div className="relative flex items-center">
              <input
                type="text"
                value={searchQuery.travel_time || "12:39"}
                onChange={(e) => setSearchQuery({ travel_time: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-800 focus:outline-none focus:border-teal-600 shadow-2xs"
              />
              <div className="absolute right-3 text-slate-400 pointer-events-none">
                <Clock className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        </div>

        {/* Passengers */}
        <div className="space-y-1.5 pt-1">
          <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
            <Users className="w-3.5 h-3.5 text-slate-500" />
            <span>Passengers</span>
          </label>
          <div className="relative flex items-center">
            <select
              value={searchQuery.passenger_count}
              onChange={(e) =>
                setSearchQuery({ passenger_count: Number(e.target.value) })
              }
              className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 appearance-none focus:outline-none focus:border-teal-600 cursor-pointer shadow-2xs"
            >
              <option value={1}>1 passenger</option>
              <option value={2}>2 passengers</option>
              <option value={3}>3 passengers</option>
              <option value={4}>4 passengers</option>
              <option value={5}>5+ passengers</option>
            </select>
            <div className="absolute right-3.5 text-slate-400 pointer-events-none">
              <ChevronDown className="w-4 h-4" />
            </div>
          </div>
        </div>

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
