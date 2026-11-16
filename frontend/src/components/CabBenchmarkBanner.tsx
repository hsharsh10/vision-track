import React from "react";
import { TrendingUp, Car, Sparkles, Leaf, ArrowRight } from "lucide-react";
import { RouteOption } from "../types";

interface Props {
  benchmark: RouteOption;
  bestOption?: RouteOption;
}

export const CabBenchmarkBanner: React.FC<Props> = ({ benchmark, bestOption }) => {
  if (!bestOption) return null;

  const cabFare = benchmark.total_fare_inr;
  const optFare = bestOption.total_fare_inr;
  const savings = Math.max(0, cabFare - optFare);
  const timeDiff = bestOption.total_duration_min - benchmark.total_duration_min;

  return (
    <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-900/40 rounded-2xl p-4 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
            <Car className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-300">Direct Cab Benchmark (Uber Go)</span>
              <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px] font-mono">
                ₹{Math.round(cabFare)} • {Math.round(benchmark.total_duration_min)} min
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span>Smart Multimodal alternative:</span>
              <span className="text-emerald-400 font-bold">₹{Math.round(optFare)}</span>
              <span className="text-slate-500">•</span>
              <span className="text-amber-400 font-semibold">Save ₹{Math.round(savings)} ({( (savings/cabFare)*100 ).toFixed(0)}% Off)</span>
            </p>
          </div>
        </div>

        {/* Environmental & Monthly Impact */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <div className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-1.5">
            <Leaf className="w-3.5 h-3.5" />
            <span>{(bestOption.co2_saved_kg || 1.8).toFixed(1)} kg CO₂ avoided</span>
          </div>
        </div>
      </div>
    </div>
  );
};
