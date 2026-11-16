import React from "react";
import { Zap, DollarSign, Award, Footprints, Shuffle, Leaf, HeartHandshake } from "lucide-react";
import { useMobilityStore } from "../store/mobilityStore";
import { RoutePriority } from "../types";

export const PriorityTabs: React.FC = () => {
  const { activePriorityTab, setActivePriorityTab } = useMobilityStore();

  const tabs: { id: RoutePriority; label: string; icon: any; desc: string }[] = [
    { id: "best_overall", label: "Best Overall", icon: Award, desc: "Pareto Balanced" },
    { id: "fastest", label: "Fastest", icon: Zap, desc: "Minimal Duration" },
    { id: "cheapest", label: "Cheapest", icon: DollarSign, desc: "Maximum Savings" },
    { id: "comfortable", label: "Comfortable", icon: HeartHandshake, desc: "Easy Journey" },
    { id: "least_walking", label: "Least Walking", icon: Footprints, desc: "Doorstep First/Last Mile" },
    { id: "least_transfers", label: "Least Transfers", icon: Shuffle, desc: "Direct / 1 Switch" },
    { id: "eco_friendly", label: "Eco-Friendly", icon: Leaf, desc: "Low Emissions" },
  ];

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activePriorityTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActivePriorityTab(tab.id)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition border ${
              isActive
                ? "bg-slate-800 text-amber-400 border-amber-500/50 shadow-md shadow-amber-500/10"
                : "bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <Icon className={`w-3.5 h-3.5 ${isActive ? "text-amber-400" : "text-slate-400"}`} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
};
