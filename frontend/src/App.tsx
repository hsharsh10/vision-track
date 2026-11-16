import React, { useEffect, useState } from "react";
import { Header } from "./components/Header";
import { SearchWidget } from "./components/SearchWidget";
import { RouteCard } from "./components/RouteCard";
import { EmptyState } from "./components/EmptyState";
import { MapView } from "./components/MapView";
import { RouteDetailModal } from "./components/RouteDetailModal";
import { PreferencesModal } from "./components/PreferencesModal";
import { MLTransparencyModal } from "./components/MLTransparencyModal";
import { LocationPickerModal } from "./components/LocationPickerModal";
import { useMobilityStore } from "./store/mobilityStore";
import { RouteOption } from "./types";
import { AlertCircle } from "lucide-react";

export const App: React.FC = () => {
  const {
    executeSearch,
    searchResult,
    selectedRoute,
    setSelectedRoute,
    isLoading,
    error,
    activeView,
    hasSearched,
    searchQuery,
    isPickerOpen,
    closeLocationPicker,
    pickerTarget,
    setPickupLocation,
    setDestLocation,
  } = useMobilityStore();

  const [detailModalRoute, setDetailModalRoute] = useState<RouteOption | null>(null);

  useEffect(() => {
    // Initial execution to populate initial routes matching the screenshot
    executeSearch();
  }, []);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 flex flex-col font-sans selection:bg-teal-500 selection:text-white">
      {/* Top Navigation */}
      <Header />

      {/* Main Container */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto p-4 sm:p-6 lg:p-8">
        {/* Error Notification if any */}
        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs sm:text-sm flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
            <div>
              <strong>Note:</strong> {error}
            </div>
          </div>
        )}

        {/* 2-Column Responsive Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Search & Options Console (Image 1, 2, 3 Left) */}
          <div className="lg:col-span-5">
            <SearchWidget />
          </div>

          {/* Right Column: Results Cards OR Empty State OR Map View */}
          <div className="lg:col-span-7">
            {activeView === "map" ? (
              /* Map View */
              <div className="sticky top-20">
                <MapView selectedRoute={selectedRoute} />
              </div>
            ) : !hasSearched || !searchResult || searchResult.routes.length === 0 ? (
              /* Empty State (Matching Image 3) */
              <EmptyState />
            ) : isLoading ? (
              /* Loading State */
              <div className="bg-white rounded-3xl border border-slate-200/90 p-12 text-center shadow-xs space-y-4">
                <div className="w-8 h-8 border-3 border-teal-700 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm font-medium text-slate-600">
                  Simulating transit networks, metro transfers and baseline fares...
                </p>
              </div>
            ) : (
              /* Route Cards (Matching Image 1 & Image 2) */
              <div className="space-y-4">
                {searchResult.routes.map((route) => (
                  <RouteCard
                    key={route.id}
                    route={route}
                    isSelected={selectedRoute?.id === route.id}
                    onSelect={() => setSelectedRoute(route)}
                    onOpenDetails={() => setDetailModalRoute(route)}
                    departureTime={searchQuery.travel_time || "12:39"}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modals & Drawers */}
      <RouteDetailModal
        route={detailModalRoute}
        onClose={() => setDetailModalRoute(null)}
      />
      <PreferencesModal />
      <MLTransparencyModal />
      <LocationPickerModal
        isOpen={isPickerOpen}
        onClose={closeLocationPicker}
        target={pickerTarget}
        initialLat={pickerTarget === "origin" ? searchQuery.origin_lat : searchQuery.dest_lat}
        initialLon={pickerTarget === "origin" ? searchQuery.origin_lon : searchQuery.dest_lon}
        onConfirmLocation={(target, loc) => {
          if (target === "origin") {
            setPickupLocation(loc);
          } else {
            setDestLocation(loc);
          }
        }}
      />
    </div>
  );
};

export default App;
