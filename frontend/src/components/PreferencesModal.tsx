import React from "react";
import { X, Sliders, Footprints, CreditCard, Sparkles, Accessibility } from "lucide-react";
import { useMobilityStore } from "../store/mobilityStore";

export const PreferencesModal: React.FC = () => {
  const {
    showPreferencesModal,
    setShowPreferencesModal,
    searchQuery,
    setSearchQuery,
    executeSearch,
  } = useMobilityStore();

  if (!showPreferencesModal) return null;

  const handleSave = () => {
    setShowPreferencesModal(false);
    executeSearch();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 m-0">Personal Mobility Preferences</h2>
              <p className="text-xs text-slate-500 m-0">Fine-tune routing constraints & concessions</p>
            </div>
          </div>
          <button
            onClick={() => setShowPreferencesModal(false)}
            className="p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs">
          {/* Max Walking Distance */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                <Footprints className="w-3.5 h-3.5 text-teal-700" />
                Maximum Walking Distance
              </span>
              <span className="font-mono font-bold text-teal-700">
                {searchQuery.max_walking_meters} meters
              </span>
            </div>
            <input
              type="range"
              min={300}
              max={3500}
              step={100}
              value={searchQuery.max_walking_meters}
              onChange={(e) => setSearchQuery({ max_walking_meters: Number(e.target.value) })}
              className="w-full accent-teal-700 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
              <span>300m (First/Last Mile Cab)</span>
              <span>1.5km (Standard)</span>
              <span>3.5km (High Endurance)</span>
            </div>
          </div>

          {/* Max Budget Filter */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-semibold text-slate-800">Trip Budget Cap</span>
              <span className="font-mono font-bold text-emerald-700">
                {searchQuery.max_budget_inr ? `₹${searchQuery.max_budget_inr}` : "No Limit"}
              </span>
            </div>
            <input
              type="range"
              min={50}
              max={1200}
              step={50}
              value={searchQuery.max_budget_inr || 1200}
              onChange={(e) => setSearchQuery({ max_budget_inr: Number(e.target.value) })}
              className="w-full accent-teal-700 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
            />
          </div>

          {/* DMRC Smart Card Discount */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
            <div>
              <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-teal-700" />
                DMRC Smart Card Holder
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Applies 10% standard off-token discount + 10% off-peak hours
              </div>
            </div>
            <input
              type="checkbox"
              checked={searchQuery.has_smart_card}
              onChange={(e) => setSearchQuery({ has_smart_card: e.target.checked })}
              className="w-4 h-4 accent-teal-700 rounded cursor-pointer"
            />
          </div>

          {/* DTC Pink Pass */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
            <div>
              <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-rose-500" />
                DTC Pink Pass Concession
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Zero ticket fare on all Delhi Govt DTC buses for female passengers
              </div>
            </div>
            <input
              type="checkbox"
              checked={searchQuery.pink_pass}
              onChange={(e) => setSearchQuery({ pink_pass: e.target.checked })}
              className="w-4 h-4 accent-teal-700 rounded cursor-pointer"
            />
          </div>

          {/* Wheelchair Accessibility */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
            <div>
              <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                <Accessibility className="w-3.5 h-3.5 text-teal-700" />
                Wheelchair Accessibility Required
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Filters for stations with lifts and ramps, avoids 2-wheelers
              </div>
            </div>
            <input
              type="checkbox"
              checked={searchQuery.wheelchair_accessible}
              onChange={(e) => setSearchQuery({ wheelchair_accessible: e.target.checked })}
              className="w-4 h-4 accent-teal-700 rounded cursor-pointer"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
          <button
            onClick={() => setShowPreferencesModal(false)}
            className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-200 font-semibold text-xs transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-[#005f56] hover:bg-[#004d46] text-white font-semibold text-xs shadow-xs transition cursor-pointer"
          >
            Apply Preferences
          </button>
        </div>
      </div>
    </div>
  );
};
