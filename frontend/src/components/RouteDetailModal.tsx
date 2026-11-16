import React from "react";
import {
  X,
  Clock,
  Footprints,
  Shuffle,
  ShieldCheck,
  ExternalLink,
  Train,
  Car,
  Bike,
} from "lucide-react";
import { RouteOption, RouteSegment, ModeType } from "../types";

interface Props {
  route: RouteOption | null;
  onClose: () => void;
}

export const RouteDetailModal: React.FC<Props> = ({ route, onClose }) => {
  if (!route) return null;

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900 m-0">{route.title}</h2>
              {route.is_recommended && (
                <span className="px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 text-[10px] font-bold border border-teal-200">
                  Recommended
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1 m-0">
              Total Duration: {Math.round(route.total_duration_min)} mins • Total Fare: ₹{Math.round(route.total_fare_inr)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Summary Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
              <div className="text-[11px] text-slate-500">Total Fare</div>
              <div className="text-xl font-bold text-slate-900 mt-0.5">₹{Math.round(route.total_fare_inr)}</div>
              <div className="text-[10px] text-slate-400 font-mono">
                ₹{Math.round(route.fare_estimate.range_min)}–₹{Math.round(route.fare_estimate.range_max)}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
              <div className="text-[11px] text-slate-500">Door-to-Door Time</div>
              <div className="text-xl font-bold text-teal-700 mt-0.5">{Math.round(route.total_duration_min)} min</div>
              <div className="text-[10px] text-slate-400">Includes wait & transfer</div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
              <div className="text-[11px] text-slate-500">Total Walking</div>
              <div className="text-xl font-bold text-slate-800 mt-0.5">
                {Math.round(route.total_walking_km * 1000)}m
              </div>
              <div className="text-[10px] text-slate-400">{route.transfer_count} transfers</div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
              <div className="text-[11px] text-slate-500">Direct Cab Savings</div>
              <div className="text-xl font-bold text-emerald-700 mt-0.5">
                {route.direct_cab_savings_inr > 0 ? `₹${Math.round(route.direct_cab_savings_inr)}` : "₹0"}
              </div>
              <div className="text-[10px] text-slate-400">vs direct ride</div>
            </div>
          </div>

          {/* Pricing Transparency Card */}
          <div className="p-3.5 rounded-2xl bg-teal-50/60 border border-teal-200/60 text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-teal-900 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-teal-700" />
                Baseline Fare Formula & Regulatory Slabs
              </span>
              <span className="px-2 py-0.5 rounded bg-teal-100 text-teal-800 text-[10px] font-mono">
                {route.fare_estimate.source}
              </span>
            </div>
            <p className="text-teal-800 text-[11px] leading-relaxed m-0">
              {route.fare_estimate.data_freshness_desc}. Fares follow official Delhi Government transit tariffs and distance formulas.
            </p>
          </div>

          {/* Turn-by-turn Step Progression */}
          <div className="space-y-3 pt-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 m-0">
              Turn-by-Turn Journey Itinerary
            </h3>

            <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              {route.segments.map((seg, idx) => {
                const Icon = getModeIcon(seg.mode);
                return (
                  <div key={idx} className="relative">
                    <div
                      className="absolute -left-6 top-0 w-5 h-5 rounded-full flex items-center justify-center text-white shadow-xs border-2 border-white"
                      style={{
                        backgroundColor: seg.line_color || (seg.mode === "METRO" ? "#2563eb" : "#0d9488"),
                      }}
                    >
                      <Icon className="w-3 h-3 text-white" />
                    </div>

                    <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 text-sm">
                          {seg.vehicle_name || seg.mode} ({seg.provider})
                        </span>
                        <span className="font-mono font-semibold text-slate-700 text-xs">
                          {(seg.fare ?? seg.fare_inr ?? 0) > 0 ? `₹${Math.round(seg.fare ?? seg.fare_inr ?? 0)}` : "Free"}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 m-0">
                        {seg.instructions || `${seg.start_location?.name || seg.from_name} → ${seg.end_location?.name || seg.to_name}`}
                      </p>

                      <div className="flex items-center gap-3 text-[11px] text-slate-400 pt-1">
                        <span>
                          {seg.distance_meters ? `${(seg.distance_meters / 1000).toFixed(2)} km` : `${seg.distance_km ?? 0} km`}
                        </span>
                        <span>•</span>
                        <span>
                          {Math.round(seg.duration_seconds ? seg.duration_seconds / 60 : (seg.duration_min ?? 0))} mins travel
                        </span>
                        {(seg.wait_time_min ?? 0) > 0 && (
                          <>
                            <span>•</span>
                            <span>~{Math.round(seg.wait_time_min ?? 0)}m wait</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition cursor-pointer"
          >
            Close Itinerary
          </button>
        </div>
      </div>
    </div>
  );
};
