import React from "react";
import { Route, Wallet, Gauge, ShieldCheck } from "lucide-react";

export const EmptyState: React.FC = () => {
  return (
    <div className="space-y-4">
      {/* Top Dashed Box */}
      <div className="bg-white border-2 border-dashed border-teal-200/80 rounded-3xl p-6 sm:p-8">
        <span className="text-teal-700 font-semibold text-xs sm:text-sm tracking-wide">
          Ready when you are
        </span>
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mt-2 tracking-tight">
          Enter a pickup and destination to compare routes
        </h2>
        <p className="text-slate-600 text-xs sm:text-sm mt-2 leading-relaxed">
          Results appear here with the estimated fare, travel time, walking distance, transfers and the source of every price.
        </p>
      </div>

      {/* 3 Feature Value Props */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {/* Card 1 */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:border-slate-300 transition">
          <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center text-teal-700">
            <Route className="w-5 h-5 text-teal-700" />
          </div>
          <h3 className="font-bold text-slate-900 text-sm mt-3 mb-1">
            Multimodal routes
          </h3>
          <p className="text-slate-500 text-xs leading-relaxed m-0">
            Combine autos, cabs, metro and walking into one journey.
          </p>
        </div>

        {/* Card 2 */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:border-slate-300 transition">
          <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center text-teal-700">
            <Wallet className="w-5 h-5 text-teal-700" />
          </div>
          <h3 className="font-bold text-slate-900 text-sm mt-3 mb-1">
            Clear cost breakdown
          </h3>
          <p className="text-slate-500 text-xs leading-relaxed m-0">
            Every fare shows its source and how confident we are in it.
          </p>
        </div>

        {/* Card 3 */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:border-slate-300 transition">
          <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center text-teal-700">
            <Gauge className="w-5 h-5 text-teal-700" />
          </div>
          <h3 className="font-bold text-slate-900 text-sm mt-3 mb-1">
            Ranked for you
          </h3>
          <p className="text-slate-500 text-xs leading-relaxed m-0">
            Pick fastest, cheapest or most comfortable, or let us balance them.
          </p>
        </div>
      </div>

      {/* Amber Transit Estimates Disclaimer */}
      <div className="bg-amber-50/75 border border-amber-200/80 rounded-2xl p-4 sm:p-5 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-amber-800 shrink-0 mt-0.5" />
        <p className="text-amber-900 text-xs leading-relaxed m-0">
          This version uses a sample transit network and baseline fare estimates. No live Ola, Uber or Rapido quotes are connected yet, so prices are estimates rather than guaranteed fares.
        </p>
      </div>
    </div>
  );
};
