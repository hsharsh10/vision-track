import React, { useState } from "react";
import {
  Car,
  Train,
  Footprints,
  Bike,
  ChevronDown,
  ChevronUp,
  Shuffle,
  ShieldCheck,
  MapPin,
  CheckCircle2,
  Navigation,
  ArrowRight,
  Info,
} from "lucide-react";
import { RouteOption, RouteLeg, ModeType } from "../types";

interface Props {
  route: RouteOption;
  isSelected: boolean;
  onSelect: () => void;
  onOpenDetails?: () => void;
}

export const RouteCard: React.FC<Props> = ({
  route,
  isSelected,
  onSelect,
  onOpenDetails,
}) => {
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);

  // Helper for mode icons
  const getModeIcon = (mode: ModeType) => {
    switch (mode) {
      case "METRO":
      case "BUS":
        return Train;
      case "CAB":
      case "AUTO":
        return Car;
      case "BIKE":
        return Bike;
      case "WALK":
      default:
        return Footprints;
    }
  };

  // Helper for mode line color according to specification
  const getModeColor = (mode: ModeType, customColor?: string) => {
    if (customColor) return customColor;
    switch (mode) {
      case "METRO":
        return "#2563EB"; // Blue solid
      case "CAB":
      case "AUTO":
        return "#0D9488"; // Teal solid
      case "BIKE":
        return "#9333EA"; // Purple solid
      case "WALK":
        return "#EA580C"; // Orange dashed
      case "BUS":
        return "#DC2626"; // Red solid
      default:
        return "#0D9488";
    }
  };

  // Unified legs array strictly from route data
  const legs: RouteLeg[] =
    route.legs && route.legs.length > 0 ? route.legs : route.segments || [];

  // Route statistics strictly calculated from legs / standardized fields
  const walkingMeters = Math.round(
    route.walking_distance_meters ??
    legs
      .filter((l) => l.mode === "WALK")
      .reduce((sum, l) => sum + (l.distance_meters || (l.distance_km || 0) * 1000), 0)
  );

  const drivingMeters = Math.round(
    route.driving_distance_meters ??
    legs
      .filter((l) => ["CAB", "AUTO", "BIKE"].includes(l.mode))
      .reduce((sum, l) => sum + (l.distance_meters || (l.distance_km || 0) * 1000), 0)
  );

  const metroMeters = Math.round(
    route.metro_distance_meters ??
    legs
      .filter((l) => l.mode === "METRO")
      .reduce((sum, l) => sum + (l.distance_meters || (l.distance_km || 0) * 1000), 0)
  );

  const busMeters = Math.round(
    route.bus_distance_meters ??
    legs
      .filter((l) => l.mode === "BUS")
      .reduce((sum, l) => sum + (l.distance_meters || (l.distance_km || 0) * 1000), 0)
  );

  const totalFare = Math.round(route.total_estimated_fare ?? route.total_fare_inr);
  const totalDuration = Math.round(route.total_journey_duration_min ?? route.total_duration_min);
  const motorizedCount =
    route.motorized_legs_count ?? legs.filter((l) => l.mode !== "WALK").length;
  const transferCount = route.transfer_count;

  // Comparison note calculation
  const directCabFare = route.direct_cab_fare_inr || 129;
  const fareDiff = Math.round(totalFare - directCabFare);

  // Confidence & Source info
  const confidence = route.fare_estimate?.confidence || "Medium";
  const sourceDesc =
    route.fare_estimate?.data_freshness_desc ||
    route.fare_estimate?.source ||
    "Official transit network & tariff model";

  return (
    <div
      onClick={onSelect}
      className={`bg-white rounded-3xl border transition p-6 sm:p-7 space-y-4 shadow-xs hover:shadow-md cursor-pointer ${
        isSelected
          ? "border-teal-600 ring-2 ring-teal-600/20"
          : "border-slate-200/90 hover:border-slate-300"
      }`}
    >
      {/* Route Name & Title */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight m-0">
              {route.title}
            </h3>
            {route.route_name && route.route_name !== route.title && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold border border-slate-200">
                {route.route_name}
              </span>
            )}
            {route.is_recommended && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
                ⭐ Recommended
              </span>
            )}
          </div>
        </div>

        {/* View Details modal launcher */}
        {onOpenDetails && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetails();
            }}
            className="text-xs text-teal-700 hover:text-teal-900 font-medium shrink-0 pt-1"
          >
            Details
          </button>
        )}
      </div>

      {/* Primary Metrics Row (EST. FARE, Duration, Walking, Transfers, Motorized Legs) */}
      <div className="grid grid-cols-5 gap-2 items-baseline pt-1 border-t border-slate-100">
        <div>
          <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            EST. FARE
          </span>
          <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-none mt-1 block">
            ₹{totalFare}
          </span>
        </div>

        <div>
          <span className="text-[10px] sm:text-[11px] font-medium text-slate-400 block">
            Duration
          </span>
          <span className="text-xs sm:text-sm font-semibold text-slate-800 mt-1 block">
            {totalDuration} min
          </span>
        </div>

        <div>
          <span className="text-[10px] sm:text-[11px] font-medium text-slate-400 block">
            Walking
          </span>
          <span className="text-xs sm:text-sm font-semibold text-slate-800 mt-1 block">
            {walkingMeters >= 1000 ? `${(walkingMeters / 1000).toFixed(2)} km` : `${walkingMeters} m`}
          </span>
        </div>

        <div>
          <span className="text-[10px] sm:text-[11px] font-medium text-slate-400 block">
            Transfers
          </span>
          <span className="text-xs sm:text-sm font-semibold text-slate-800 mt-1 block">
            {transferCount}
          </span>
        </div>

        <div>
          <span className="text-[10px] sm:text-[11px] font-medium text-slate-400 block" title="Number of motorized transport legs (Cab, Auto, Bike, Metro, Bus)">
            Motorized Legs
          </span>
          <span className="text-xs sm:text-sm font-semibold text-slate-800 mt-1 block">
            {motorizedCount}
          </span>
        </div>
      </div>

      {/* Multimodal Segment Distances Breakdown Strip */}
      {(drivingMeters > 0 || metroMeters > 0 || busMeters > 0) && (
        <div className="flex items-center gap-2 flex-wrap text-[11px] font-medium text-slate-600 bg-slate-50/80 rounded-xl px-3 py-2 border border-slate-200/60">
          <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">
            Breakdown:
          </span>
          {walkingMeters > 0 && (
            <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
              🚶 Walk: {walkingMeters >= 1000 ? `${(walkingMeters / 1000).toFixed(2)} km` : `${walkingMeters} m`}
            </span>
          )}
          {drivingMeters > 0 && (
            <span className="inline-flex items-center gap-1 text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200/60">
              🚗 Driving: {(drivingMeters / 1000).toFixed(1)} km
            </span>
          )}
          {metroMeters > 0 && (
            <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200/60">
              🚇 Metro: {(metroMeters / 1000).toFixed(1)} km
            </span>
          )}
          {busMeters > 0 && (
            <span className="inline-flex items-center gap-1 text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200/60">
              🚌 Bus: {(busMeters / 1000).toFixed(1)} km
            </span>
          )}
        </div>
      )}

      {/* Comparison with cheapest direct cab */}
      <div>
        {fareDiff > 0 ? (
          <p className="text-xs sm:text-sm font-medium text-amber-800 m-0">
            About ₹{fareDiff} more than the cheapest direct cab (₹{directCabFare})
          </p>
        ) : fareDiff < 0 ? (
          <p className="text-xs sm:text-sm font-medium text-emerald-700 m-0">
            About ₹{Math.abs(fareDiff)} cheaper than the direct cab (Save {Math.round((Math.abs(fareDiff) / directCabFare) * 100)}%)
          </p>
        ) : (
          <p className="text-xs sm:text-sm font-medium text-slate-600 m-0">
            Same price as the cheapest direct cab (₹{directCabFare})
          </p>
        )}
      </div>

      {/* Confidence Pill / Badge & Source */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] sm:text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200">
          <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
          <span>{confidence} confidence</span>
          <span className="text-slate-400">•</span>
          <span className="text-slate-600 truncate max-w-[280px]">{sourceDesc}</span>
        </span>
      </div>

      {/* Vehicle / Mode Chips */}
      <div className="flex items-center gap-2 flex-wrap">
        {legs
          .filter((s) => s.mode !== "WALK")
          .map((seg, idx) => {
            const Icon = getModeIcon(seg.mode);
            const label =
              seg.vehicle_or_transit_details?.category ||
              seg.vehicle_name ||
              seg.provider ||
              seg.mode;
            return (
              <div
                key={idx}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200/60"
              >
                <Icon className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                <span>{label}</span>
              </div>
            );
          })}
      </div>

      {/* Accordion: Step-by-step breakdown (Section 7) */}
      <div className="pt-2 border-t border-slate-100">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsBreakdownOpen(!isBreakdownOpen);
          }}
          className="w-full flex items-center justify-between text-teal-700 hover:text-teal-800 text-xs sm:text-sm font-semibold py-1 transition cursor-pointer"
        >
          <span>Step-by-step journey breakdown ({legs.length} segments)</span>
          {isBreakdownOpen ? (
            <ChevronUp className="w-4 h-4 text-teal-700" />
          ) : (
            <ChevronDown className="w-4 h-4 text-teal-700" />
          )}
        </button>

        {/* Expanded Steps matching exact Section 7 requirements */}
        {isBreakdownOpen && (
          <div className="mt-4 pt-3 border-t border-slate-100 space-y-4">
            <div className="relative pl-7 space-y-4 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              {legs.map((leg, idx) => {
                const Icon = getModeIcon(leg.mode);
                const color = getModeColor(leg.mode, leg.line_color);
                const legDistM = leg.distance_meters ?? ((leg.distance_km || 0) * 1000);
                const legDurMin = Math.round(
                  leg.duration_seconds ? leg.duration_seconds / 60 : (leg.duration_min || 0)
                );
                const legFare = Math.round(leg.fare ?? (leg.fare_inr || 0));

                const distDisplay =
                  legDistM < 1000
                    ? `${Math.round(legDistM)} m`
                    : `${(legDistM / 1000).toFixed(2)} km`;

                // Title based on mode & provider
                let stepTitle = "";
                if (leg.mode === "WALK") {
                  stepTitle =
                    idx === 0
                      ? `Walk to pickup / ${leg.end_location?.name || leg.to_name || "station"}`
                      : idx === legs.length - 1
                      ? `Walk to destination (${leg.end_location?.name || leg.to_name})`
                      : `Walk to ${leg.end_location?.name || leg.to_name}`;
                } else if (leg.mode === "METRO") {
                  stepTitle = `${leg.provider || "DMRC"} Metro`;
                } else if (leg.mode === "BUS") {
                  stepTitle = `${leg.provider || "DTC"} Bus`;
                } else if (leg.mode === "AUTO") {
                  stepTitle = `${leg.provider || "Rapido"} Auto`;
                } else if (leg.mode === "CAB") {
                  stepTitle = `${leg.provider || "Uber"} Cab (${leg.vehicle_or_transit_details?.category || leg.vehicle_name || "Direct"})`;
                } else if (leg.mode === "BIKE") {
                  stepTitle = `${leg.provider || "Rapido"} Bike Taxi`;
                } else {
                  stepTitle = leg.vehicle_name || leg.provider || leg.mode;
                }

                return (
                  <div key={leg.leg_id || idx} className="relative">
                    {/* Icon circle */}
                    <div
                      className="absolute -left-7 top-0 w-6 h-6 rounded-full flex items-center justify-center text-white border-2 border-white shadow-xs font-bold text-[10px]"
                      style={{ backgroundColor: color }}
                    >
                      <Icon className="w-3.5 h-3.5 text-white" />
                    </div>

                    <div className="bg-slate-50/90 rounded-2xl p-3.5 border border-slate-200/80 text-xs space-y-1.5 shadow-2xs">
                      {/* Step Header */}
                      <div className="flex items-center justify-between font-bold text-slate-900">
                        <span className="flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-400 font-mono">
                            {idx + 1}.
                          </span>
                          <span>{stepTitle}</span>
                        </span>
                        <span className="font-mono text-slate-800 font-bold">
                          {legFare > 0 ? `₹${legFare}` : "₹0"}
                        </span>
                      </div>

                      {/* Stat summary line: 150 m | 2 min | ₹0 */}
                      <div className="text-[11px] font-semibold text-slate-700 flex items-center gap-2">
                        <span>{distDisplay}</span>
                        <span className="text-slate-300">•</span>
                        <span>{legDurMin} min</span>
                        <span className="text-slate-300">•</span>
                        <span className={legFare > 0 ? "text-slate-900" : "text-emerald-700"}>
                          {legFare > 0 ? `₹${legFare}` : "Free"}
                        </span>
                      </div>

                      {/* Location endpoints */}
                      <div className="text-slate-600 text-[11px] leading-relaxed pt-0.5">
                        <div className="flex items-center gap-1 text-slate-700 font-medium">
                          <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span className="truncate">{leg.start_location?.name || leg.from_name}</span>
                          <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">{leg.end_location?.name || leg.to_name}</span>
                        </div>
                      </div>

                      {/* Transit specific details (station count, line name, etc.) */}
                      {leg.vehicle_or_transit_details && (
                        <div className="text-[11px] text-slate-500 pt-1 space-y-0.5">
                          {leg.vehicle_or_transit_details.line_name && (
                            <div className="flex items-center gap-1.5">
                              <span
                                className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                                style={{ backgroundColor: color }}
                              />
                              <span className="font-semibold text-slate-800">
                                {leg.vehicle_or_transit_details.line_name} Line
                              </span>
                              {leg.vehicle_or_transit_details.station_count && (
                                <span className="text-slate-500">
                                  ({leg.vehicle_or_transit_details.station_count} stations
                                  {leg.vehicle_or_transit_details.interchanges
                                    ? `, ${leg.vehicle_or_transit_details.interchanges} interchange`
                                    : ""}
                                  )
                                </span>
                              )}
                            </div>
                          )}
                          {leg.vehicle_or_transit_details.bus_route && (
                            <div className="font-medium text-slate-700">
                              Route: {leg.vehicle_or_transit_details.bus_route}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Instructions if present */}
                      {leg.instructions && (
                        <p className="text-[11px] text-slate-500 m-0 pt-0.5 italic">
                          {leg.instructions}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Footnote */}
      <p className="text-[11px] text-slate-400 mt-2 m-0">
        Source: {sourceDesc}
      </p>
    </div>
  );
};
