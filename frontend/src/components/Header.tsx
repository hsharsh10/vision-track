import React from "react";
import {
  Compass,
  Map,
  List,
  Sliders,
  Wifi,
  WifiOff,
  MapPin,
} from "lucide-react";
import { useMobilityStore } from "../store/mobilityStore";

export const Header: React.FC = () => {
  const {
    activeView,
    setActiveView,
    clearSearch,
    setShowPreferencesModal,
    setShowMetricsModal,
    liveData,
  } = useMobilityStore();

  const { backendOnline, olaMapsReady, lastFetchedAt, liveTravelTimeMin, liveTravelDistanceKm } = liveData;

  return (
    <header className="bg-white border-b border-slate-200/90 sticky top-0 z-40 px-4 sm:px-6 py-3">
      <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4">

        {/* ── Brand ───────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-800 text-white flex items-center justify-center shadow-xs">
            <Compass className="w-5 h-5 text-teal-200" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 text-base sm:text-lg tracking-tight">
                GatiMarg
              </span>
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
                Pilot
              </span>
            </div>
            <p className="text-[11px] text-slate-500 m-0 hidden sm:block">
              Delhi NCR Multimodal Transit &amp; Direct Cab Comparison
            </p>
          </div>
        </div>

        {/* ── Live Status Badges ───────────────────────────────────────── */}
        <div className="hidden md:flex items-center gap-2 text-[10px]">
          {/* Backend status */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-semibold ${
              backendOnline
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-slate-50 text-slate-500 border-slate-200"
            }`}
            title={backendOnline ? "FastAPI backend is live" : "Backend offline — using ML fallback"}
          >
            {backendOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {backendOnline ? "Backend Live" : "Offline (ML)"}
          </div>

          {/* Ola Maps status */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-semibold ${
              olaMapsReady
                ? "bg-teal-50 text-teal-800 border-teal-200"
                : "bg-slate-50 text-slate-400 border-slate-200"
            }`}
            title={olaMapsReady ? "Ola Maps live vector tiles & directions active" : "Waiting for Ola Maps"}
          >
            <MapPin className="w-3 h-3 text-teal-700" />
            {olaMapsReady
              ? liveTravelTimeMin
                ? `Ola Maps · ${liveTravelTimeMin} min (${liveTravelDistanceKm} km)`
                : "Ola Maps Live"
              : "Ola Maps Loading"}
          </div>

          {lastFetchedAt && (
            <span className="text-slate-400 font-normal">Updated {lastFetchedAt}</span>
          )}
        </div>

        {/* ── Controls ────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2">
          {/* Quick Clear */}
          <div className="hidden md:flex items-center gap-1.5 text-xs">
            <button
              onClick={clearSearch}
              className="px-2.5 py-1 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition text-[11px] font-medium"
            >
              Clear
            </button>
          </div>

          {/* Cards vs Map Toggle */}
          <div className="flex items-center p-0.5 bg-slate-100 rounded-xl border border-slate-200 text-xs">
            <button
              onClick={() => setActiveView("cards")}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                activeView === "cards"
                  ? "bg-white text-slate-900 shadow-xs font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Cards</span>
            </button>
            <button
              onClick={() => setActiveView("map")}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                activeView === "map"
                  ? "bg-white text-slate-900 shadow-xs font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Map className="w-3.5 h-3.5" />
              <span>🗺 Map</span>
            </button>
          </div>

          {/* ML Metrics */}
          <button
            onClick={() => setShowMetricsModal(true)}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition border border-slate-200 hidden sm:flex"
            title="ML Model Metrics"
          >
            <span className="text-[10px] font-bold">ML</span>
          </button>

          {/* Preferences */}
          <button
            onClick={() => setShowPreferencesModal(true)}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition border border-slate-200"
            title="Travel Preferences"
          >
            <Sliders className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
