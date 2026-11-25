import React, { useEffect, useRef, useState, useCallback } from "react";
import * as maplibregl from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";

if (typeof (maplibregl as any).setWorkerUrl === "function") {
  (maplibregl as any).setWorkerUrl(maplibreWorkerUrl);
}
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { RouteOption, RouteLeg, ModeType } from "../types";
import { locationService } from "../services/locationService";
import { useMobilityStore } from "../store/mobilityStore";
import {
  Layers,
  Loader2,
  Sun,
  Moon,
  Crosshair,
  MapPin,
  Compass,
} from "lucide-react";
import {
  OLA_MAPS_KEY,
  OLA_MAPS_LIGHT_STYLE,
  OLA_MAPS_DARK_STYLE,
  getOlaMapsStyleObject,
  decodePolyline,
} from "../services/olaMaps";

// Color mapping strictly matching specification:
// - Metro: Blue solid polyline (#2563EB)
// - Cab/Auto: Teal solid polyline (#0D9488)
// - Bike: Purple solid polyline (#9333EA)
// - Walking: Orange dashed polyline (#EA580C)
// - Bus: Red solid polyline (#DC2626)
export const getSegmentColor = (mode: string, customColor?: string): string => {
  if (customColor) return customColor;
  switch (mode) {
    case "METRO":
      return "#2563EB"; // Blue
    case "BUS":
      return "#DC2626"; // Red
    case "WALK":
      return "#EA580C"; // Orange
    case "BIKE":
      return "#9333EA"; // Purple
    case "CAB":
    case "AUTO":
    case "UBER":
    case "OLA":
    case "RAPIDO":
    default:
      return "#0D9488"; // Teal
  }
};

interface Props {
  selectedRoute: RouteOption | null;
}

type MapTheme = "roadmap" | "dark";
type MapEngine = "olamaps" | "leaflet";

function createPinDOM(color: string, letter: string, title: string): HTMLElement {
  const container = document.createElement("div");
  container.className = "custom-ola-pin";
  container.title = title;
  container.style.position = "relative";
  container.style.width = "34px";
  container.style.height = "42px";
  container.style.cursor = "grab";
  container.style.display = "flex";
  container.style.alignItems = "center";
  container.style.justifyContent = "center";

  container.innerHTML = `
    <div style="
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: ${color};
      border: 3px solid #ffffff;
      box-shadow: 0 4px 12px rgba(0,0,0,0.35);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      font-weight: 700;
      font-size: 13px;
      font-family: system-ui, sans-serif;
    ">
      ${letter}
    </div>
    <div style="
      position: absolute;
      bottom: 2px;
      left: 12px;
      width: 0;
      height: 0;
      border-left: 5px solid transparent;
      border-right: 5px solid transparent;
      border-top: 8px solid ${color};
    "></div>
  `;
  return container;
}

export const MapView: React.FC<Props> = ({ selectedRoute }) => {
  const {
    pickupLocation,
    destLocation,
    setPickupLocation,
    setDestLocation,
    currentGPSLocation,
  } = useMobilityStore();

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletContainerRef = useRef<HTMLDivElement>(null);

  // Ola Maps (MapLibre GL) instances
  const olaMapRef = useRef<maplibregl.Map | null>(null);
  const olaMarkersRef = useRef<maplibregl.Marker[]>([]);
  const olaPopupsRef = useRef<maplibregl.Popup[]>([]);
  const activeLegLayersRef = useRef<string[]>([]);
  const activeLegSourcesRef = useRef<string[]>([]);

  // Leaflet fallback instances
  const leafletMapRef = useRef<L.Map | null>(null);
  const leafletLayersRef = useRef<L.LayerGroup | null>(null);

  const [mapEngine, setMapEngine] = useState<MapEngine>("olamaps");
  const [mapTheme, setMapTheme] = useState<MapTheme>("roadmap");
  const [mapLoaded, setMapLoaded] = useState(false);
  const [liveRouteInfo, setLiveRouteInfo] = useState<string | null>(null);

  // Helper to extract legs
  const getLegs = (route: RouteOption | null): RouteLeg[] => {
    if (!route) return [];
    if (route.legs && route.legs.length > 0) return route.legs;
    return route.segments || [];
  };

  // ─── Clear Ola Maps Overlays ──────────────────────────────────────────────
  const clearOlaOverlays = useCallback(() => {
    const map = olaMapRef.current;
    if (map) {
      // Remove leg layers
      activeLegLayersRef.current.forEach((layerId) => {
        try {
          if (map.getLayer(layerId)) map.removeLayer(layerId);
        } catch {}
      });
      activeLegLayersRef.current = [];

      // Remove leg sources
      activeLegSourcesRef.current.forEach((sourceId) => {
        try {
          if (map.getSource(sourceId)) map.removeSource(sourceId);
        } catch {}
      });
      activeLegSourcesRef.current = [];
    }

    // Remove markers
    olaMarkersRef.current.forEach((m) => m.remove());
    olaMarkersRef.current = [];

    // Remove popups
    olaPopupsRef.current.forEach((p) => p.remove());
    olaPopupsRef.current = [];
  }, []);

  // ─── Initialize Ola Maps ──────────────────────────────────────────────────
  const initOlaMap = useCallback(async () => {
    if (!mapContainerRef.current || olaMapRef.current) return;

    try {
      const styleObj = await getOlaMapsStyleObject(mapTheme);
      if (!mapContainerRef.current || olaMapRef.current) return;

      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: styleObj,
        center: [77.209, 28.6139], // Delhi Center [lon, lat]
        zoom: 12,
        maxZoom: 14,
        attributionControl: false,
        transformRequest: (url: string) => {
          if (url.includes("olamaps.io") && !url.includes("api_key=")) {
            const sep = url.includes("?") ? "&" : "?";
            return { url: `${url}${sep}api_key=${OLA_MAPS_KEY}` };
          }
          return { url };
        },
      });

      // Controls
      map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
      map.addControl(
        new maplibregl.AttributionControl({
          customAttribution: "© <a href='https://maps.olakrutrim.com' target='_blank' rel='noreferrer'>Ola Maps</a>",
          compact: true,
        }),
        "bottom-right"
      );

      map.on("load", () => {
        setMapLoaded(true);
        map.resize();
      });

      map.on("error", (e: any) => {
        console.warn("[Ola Maps Notice]", e?.error?.message || e);
      });

      // Safety timeout in case load event was missed
      setTimeout(() => {
        if (!mapLoaded && mapContainerRef.current) {
          setMapLoaded(true);
          map.resize();
        }
      }, 3000);

      // Interactive Click to set location
      map.on("click", (e: maplibregl.MapMouseEvent) => {
        const { lng, lat } = e.lngLat;
        const popupDiv = document.createElement("div");
        popupDiv.style.fontFamily = "system-ui, sans-serif";
        popupDiv.style.padding = "6px";
        popupDiv.style.fontSize = "12px";
        popupDiv.style.minWidth = "170px";

        popupDiv.innerHTML = `
          <div style="font-weight: 700; margin-bottom: 4px; color: #0f172a;">Set Map Location</div>
          <div style="font-size: 10px; color: #64748b; margin-bottom: 8px; font-family: monospace;">${lat.toFixed(4)}, ${lng.toFixed(4)}</div>
          <div style="display: flex; gap: 6px;">
            <button id="ola-set-pickup" style="background:#10B981; color:white; border:none; padding:5px 9px; border-radius:6px; font-size:11px; cursor:pointer; font-weight:700;">Set Pickup</button>
            <button id="ola-set-dest" style="background:#EF4444; color:white; border:none; padding:5px 9px; border-radius:6px; font-size:11px; cursor:pointer; font-weight:700;">Set Destination</button>
          </div>
        `;

        const popup = new maplibregl.Popup({ offset: 15, closeButton: true })
          .setLngLat([lng, lat])
          .setDOMContent(popupDiv)
          .addTo(map);

        olaPopupsRef.current.push(popup);

        setTimeout(() => {
          popupDiv.querySelector("#ola-set-pickup")?.addEventListener("click", async () => {
            popup.remove();
            const loc = await locationService.reverseGeocode(lat, lng, "MAP_PIN");
            setPickupLocation(loc);
          });
          popupDiv.querySelector("#ola-set-dest")?.addEventListener("click", async () => {
            popup.remove();
            const loc = await locationService.reverseGeocode(lat, lng, "MAP_PIN");
            setDestLocation(loc);
          });
        }, 50);
      });

      olaMapRef.current = map;
    } catch (err) {
      console.warn("Ola Maps initialization failed, falling back to Leaflet:", err);
      setMapEngine("leaflet");
    }
  }, [mapTheme, setPickupLocation, setDestLocation]);

  // ─── Initialize Leaflet Fallback ──────────────────────────────────────────
  const initLeafletMap = useCallback(() => {
    if (!leafletContainerRef.current || leafletMapRef.current) return;

    const lmap = L.map(leafletContainerRef.current, {
      center: [28.6139, 77.209],
      zoom: 12,
      zoomControl: true,
    });

    // OpenStreetMap clean fallback tiles (No API key watermark required)
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
    }).addTo(lmap);

    const layerGroup = L.layerGroup().addTo(lmap);
    leafletMapRef.current = lmap;
    leafletLayersRef.current = layerGroup;
  }, []);

  // ─── Render Ola Maps Multi-Segment Route ──────────────────────────────────
  const renderOlaRoute = useCallback(() => {
    const map = olaMapRef.current;
    if (!map) return;

    clearOlaOverlays();
    const legs = getLegs(selectedRoute);
    const bounds = new maplibregl.LngLatBounds();

    // 1. Draw each individual leg polyline
    if (legs.length > 0) {
      legs.forEach((leg, index) => {
        let coords: Array<[number, number]> = [];

        // Check decoded_coordinates or path_coords: [lat, lon] -> maplibre wants [lon, lat]
        if (leg.decoded_coordinates && leg.decoded_coordinates.length > 0) {
          coords = leg.decoded_coordinates.map((c) => [c[1], c[0]]);
        } else if (leg.path_coords && leg.path_coords.length > 0) {
          coords = leg.path_coords.map((c) => [c[1], c[0]]);
        } else if (leg.encoded_polyline) {
          const dec = decodePolyline(leg.encoded_polyline);
          coords = dec.map(([lat, lon]) => [lon, lat]);
        } else if (leg.start_location && leg.end_location) {
          coords = [
            [leg.start_location.longitude, leg.start_location.latitude],
            [leg.end_location.longitude, leg.end_location.latitude],
          ];
        }

        if (coords.length === 0) return;
        coords.forEach((c) => bounds.extend(c));

        const color = getSegmentColor(leg.mode, leg.line_color);
        const isWalk = leg.mode === "WALK";

        const sourceId = `ola-leg-source-${index}`;
        const casingLayerId = `ola-leg-casing-${index}`;
        const mainLayerId = `ola-leg-line-${index}`;

        try {
          // Add GeoJSON source
          map.addSource(sourceId, {
            type: "geojson",
            data: {
              type: "Feature",
              geometry: {
                type: "LineString",
                coordinates: coords,
              },
              properties: {
                legIndex: index,
                mode: leg.mode,
                provider: leg.provider,
                fare: leg.fare,
                instructions: leg.instructions,
              },
            },
          });
          activeLegSourcesRef.current.push(sourceId);

          // Casing layer for high-contrast visibility
          map.addLayer({
            id: casingLayerId,
            type: "line",
            source: sourceId,
            layout: {
              "line-cap": "round",
              "line-join": "round",
            },
            paint: {
              "line-color": "#ffffff",
              "line-width": isWalk ? 5 : 7,
              "line-opacity": 0.85,
            },
          });
          activeLegLayersRef.current.push(casingLayerId);

          // Main route line layer
          map.addLayer({
            id: mainLayerId,
            type: "line",
            source: sourceId,
            layout: {
              "line-cap": "round",
              "line-join": "round",
            },
            paint: {
              "line-color": color,
              "line-width": isWalk ? 3.5 : 5,
              ...(isWalk ? { "line-dasharray": [2, 2] } : {}),
            },
          });
          activeLegLayersRef.current.push(mainLayerId);

          // Leg click popup
          map.on("click", mainLayerId, (e: any) => {
            const distKm = (
              leg.distance_meters ? leg.distance_meters / 1000 : leg.distance_km || 0
            ).toFixed(2);
            const durMin = Math.round(
              leg.duration_seconds ? leg.duration_seconds / 60 : leg.duration_min || 0
            );
            const fare = Math.round(leg.fare ?? leg.fare_inr ?? 0);

            const popup = new maplibregl.Popup({ offset: 12, closeButton: true })
              .setLngLat(e.lngLat)
              .setHTML(`
                <div style="font-family: system-ui, sans-serif; padding: 6px 2px; font-size: 12px; max-width: 240px;">
                  <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                    <span style="display:inline-block;width:10px;height:10px;background:${color};border-radius:50%;"></span>
                    <strong style="color: #0f172a; font-size: 13px;">${index + 1}. ${leg.mode} (${leg.provider})</strong>
                  </div>
                  <div style="color: #475569; font-size: 11px; margin-bottom: 4px;">
                    ${leg.start_location?.name || leg.from_name || "Origin"} → ${leg.end_location?.name || leg.to_name || "Destination"}
                  </div>
                  <div style="color: #64748b; font-size: 11px; font-weight: 500;">
                    ${distKm} km • ${durMin} min • ${fare > 0 ? `₹${fare}` : "Free"}
                  </div>
                  ${leg.instructions ? `<div style="color: #94a3b8; font-size: 10px; margin-top: 4px; font-style: italic;">${leg.instructions}</div>` : ""}
                </div>
              `)
              .addTo(map);

            olaPopupsRef.current.push(popup);
          });

          map.on("mouseenter", mainLayerId, () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", mainLayerId, () => {
            map.getCanvas().style.cursor = "";
          });
        } catch (e) {
          console.debug("Failed adding layer:", e);
        }
      });
    }

    // 2. Green Pickup Marker at origin (Draggable)
    const pLat = pickupLocation?.latitude ?? (legs[0]?.decoded_coordinates?.[0]?.[0] || legs[0]?.start_location?.latitude);
    const pLon = pickupLocation?.longitude ?? (legs[0]?.decoded_coordinates?.[0]?.[1] || legs[0]?.start_location?.longitude);
    const pAddress = pickupLocation?.formatted_address || pickupLocation?.name || legs[0]?.start_location?.name || "Pickup Location";

    if (pLat !== undefined && pLon !== undefined && !isNaN(pLat) && !isNaN(pLon)) {
      const pinEl = createPinDOM("#10B981", "P", `Pickup: ${pAddress} (Drag to move)`);
      const originMarker = new maplibregl.Marker({ element: pinEl, draggable: true })
        .setLngLat([pLon, pLat])
        .addTo(map);

      originMarker.on("dragend", async () => {
        const lngLat = originMarker.getLngLat();
        const loc = await locationService.reverseGeocode(lngLat.lat, lngLat.lng, "MAP_PIN");
        setPickupLocation(loc);
      });

      originMarker.getElement().addEventListener("click", (e: MouseEvent) => {
        e.stopPropagation();
        new maplibregl.Popup({ offset: 25 })
          .setLngLat([pLon, pLat])
          .setHTML(`
            <div style="font-family: system-ui, sans-serif; padding: 4px; font-size: 12px; max-width: 240px;">
              <strong style="color: #059669;">🟢 Pickup Location (Draggable)</strong><br/>
              <div style="margin-top: 3px; font-weight: 600; color: #1e293b;">${pAddress}</div>
              <div style="margin-top: 2px; font-size: 10px; color: #64748b; font-family: monospace;">${pLat.toFixed(6)}, ${pLon.toFixed(6)}</div>
            </div>
          `)
          .addTo(map);
      });

      olaMarkersRef.current.push(originMarker);
      bounds.extend([pLon, pLat]);
    }

    // 3. Red Destination Marker (Draggable)
    const lastLeg = legs.length > 0 ? legs[legs.length - 1] : null;
    const lastCoordsArr = lastLeg?.decoded_coordinates || lastLeg?.path_coords || [];
    const lastPoint = lastCoordsArr.length > 0
      ? lastCoordsArr[lastCoordsArr.length - 1]
      : [lastLeg?.end_location?.latitude, lastLeg?.end_location?.longitude];

    const dLat = destLocation?.latitude ?? (lastPoint?.[0] as number | undefined);
    const dLon = destLocation?.longitude ?? (lastPoint?.[1] as number | undefined);
    const dAddress = destLocation?.formatted_address || destLocation?.name || lastLeg?.end_location?.name || "Final Destination";

    if (dLat !== undefined && dLon !== undefined && !isNaN(dLat) && !isNaN(dLon)) {
      const pinEl = createPinDOM("#EF4444", "D", `Destination: ${dAddress} (Drag to move)`);
      const destMarker = new maplibregl.Marker({ element: pinEl, draggable: true })
        .setLngLat([dLon, dLat])
        .addTo(map);

      destMarker.on("dragend", async () => {
        const lngLat = destMarker.getLngLat();
        const loc = await locationService.reverseGeocode(lngLat.lat, lngLat.lng, "MAP_PIN");
        setDestLocation(loc);
      });

      destMarker.getElement().addEventListener("click", (e: MouseEvent) => {
        e.stopPropagation();
        new maplibregl.Popup({ offset: 25 })
          .setLngLat([dLon, dLat])
          .setHTML(`
            <div style="font-family: system-ui, sans-serif; padding: 4px; font-size: 12px; max-width: 240px;">
              <strong style="color: #dc2626;">🔴 Final Destination (Draggable)</strong><br/>
              <div style="margin-top: 3px; font-weight: 600; color: #1e293b;">${dAddress}</div>
              <div style="margin-top: 2px; font-size: 10px; color: #64748b; font-family: monospace;">${dLat.toFixed(6)}, ${dLon.toFixed(6)}</div>
            </div>
          `)
          .addTo(map);
      });

      olaMarkersRef.current.push(destMarker);
      bounds.extend([dLon, dLat]);
    }

    // 4. Live GPS Marker
    if (currentGPSLocation) {
      const gpsLat = currentGPSLocation.latitude;
      const gpsLng = currentGPSLocation.longitude;
      const gpsEl = document.createElement("div");
      gpsEl.style.width = "20px";
      gpsEl.style.height = "20px";
      gpsEl.style.borderRadius = "50%";
      gpsEl.style.backgroundColor = "#2563EB";
      gpsEl.style.border = "3px solid #ffffff";
      gpsEl.style.boxShadow = "0 0 12px rgba(37,99,235,0.7)";

      const gpsMarker = new maplibregl.Marker({ element: gpsEl })
        .setLngLat([gpsLng, gpsLat])
        .addTo(map);

      olaMarkersRef.current.push(gpsMarker);
      bounds.extend([gpsLng, gpsLat]);
    }

    // 5. Transfer markers
    if (legs.length > 1) {
      for (let i = 0; i < legs.length - 1; i++) {
        const cur = legs[i];
        const nxt = legs[i + 1];
        const curCoords = cur.decoded_coordinates || cur.path_coords || [];
        const xferPoint = curCoords.length > 0
          ? curCoords[curCoords.length - 1]
          : [cur.end_location?.latitude, cur.end_location?.longitude];

        if (xferPoint && xferPoint[0] && xferPoint[1]) {
          const xferEl = createPinDOM("#F59E0B", "⇄", `Transfer from ${cur.mode} to ${nxt.mode}`);
          const xferMarker = new maplibregl.Marker({ element: xferEl })
            .setLngLat([xferPoint[1], xferPoint[0]])
            .addTo(map);

          olaMarkersRef.current.push(xferMarker);
          bounds.extend([xferPoint[1], xferPoint[0]]);
        }
      }
    }

    // Fit map viewport smoothly to whole journey
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, {
        padding: { top: 60, bottom: 60, left: 60, right: 60 },
        maxZoom: 14,
        duration: 800,
      });
    }
  }, [selectedRoute, pickupLocation, destLocation, currentGPSLocation, clearOlaOverlays, setPickupLocation, setDestLocation]);

  // ─── Lifecycle Effects ────────────────────────────────────────────────────
  useEffect(() => {
    if (mapEngine === "olamaps") {
      initOlaMap();
    } else {
      initLeafletMap();
    }
  }, [mapEngine, initOlaMap, initLeafletMap]);

  // Render route when selectedRoute changes or map finishes loading
  useEffect(() => {
    if (mapEngine === "olamaps" && olaMapRef.current && mapLoaded) {
      // If style is still loading, wait for 'styledata' event
      if (!olaMapRef.current.isStyleLoaded()) {
        olaMapRef.current.once("styledata", () => {
          renderOlaRoute();
        });
      } else {
        renderOlaRoute();
      }
    }
  }, [mapEngine, mapLoaded, selectedRoute, renderOlaRoute]);

  // Theme change
  useEffect(() => {
    let isCancelled = false;
    if (olaMapRef.current && mapEngine === "olamaps") {
      getOlaMapsStyleObject(mapTheme).then((styleObj) => {
        if (!isCancelled && olaMapRef.current) {
          olaMapRef.current.setStyle(styleObj);
          olaMapRef.current.once("styledata", () => {
            renderOlaRoute();
          });
        }
      });
    }
    return () => {
      isCancelled = true;
    };
  }, [mapTheme, mapEngine, renderOlaRoute]);

  // Adapt map canvas to parent container sizing
  useEffect(() => {
    const handleResize = () => {
      olaMapRef.current?.resize();
    };
    window.addEventListener("resize", handleResize);
    const timer = setTimeout(() => {
      olaMapRef.current?.resize();
    }, 200);
    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(timer);
    };
  }, []);

  // Center on current position or route
  const handleRecenter = () => {
    if (olaMapRef.current) {
      if (currentGPSLocation) {
        olaMapRef.current.flyTo({
          center: [currentGPSLocation.longitude, currentGPSLocation.latitude],
          zoom: 14,
          duration: 600,
        });
      } else if (pickupLocation) {
        olaMapRef.current.flyTo({
          center: [pickupLocation.longitude, pickupLocation.latitude],
          zoom: 14,
          duration: 600,
        });
      }
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-slate-100 overflow-hidden select-none">
      {/* ── Floating Controls Bar ────────────────────────────────────────── */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 bg-white/90 backdrop-blur-md p-1 rounded-xl shadow-md border border-slate-200 text-xs">
        {/* Ola Maps Badge */}
        <div className="flex items-center gap-1 px-2 py-1 bg-teal-50 text-teal-800 rounded-lg font-semibold text-[11px] border border-teal-200">
          <Compass className="w-3.5 h-3.5 text-teal-600" />
          <span>Ola Maps Vector</span>
        </div>

        {/* Theme Toggle (Light / Dark) */}
        <button
          onClick={() => setMapTheme(mapTheme === "roadmap" ? "dark" : "roadmap")}
          title={`Switch to ${mapTheme === "roadmap" ? "Dark" : "Light"} Map`}
          className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
        >
          {mapTheme === "dark" ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-slate-600" />}
        </button>

        {/* Recenter Button */}
        <button
          onClick={handleRecenter}
          title="Center on Pickup / GPS Location"
          className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
        >
          <Crosshair className="w-4 h-4 text-slate-600" />
        </button>
      </div>

      {/* ── Mode Legends Strip ────────────────────────────────────────────── */}
      <div className="px-4 py-2 bg-white/95 backdrop-blur-md border-b border-slate-200 flex flex-wrap items-center gap-4 text-xs text-slate-600 z-10">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block ring-1 ring-white"></span>
          <span>Pickup</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block ring-1 ring-white"></span>
          <span>Destination</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block ring-1 ring-white"></span>
          <span>Transfer</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-1 bg-[#2563EB] rounded inline-block"></span>
          <span className="font-medium text-blue-700">Metro</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-1 bg-[#0D9488] rounded inline-block"></span>
          <span className="font-medium text-teal-700">Cab / Auto</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-1 bg-[#9333EA] rounded inline-block"></span>
          <span className="font-medium text-purple-700">Bike</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed border-[#EA580C] inline-block"></span>
          <span className="font-medium text-amber-700">Walking</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-1 bg-[#DC2626] rounded inline-block"></span>
          <span className="font-medium text-rose-700">Bus</span>
        </div>
      </div>

      {/* ── Map Canvas Container ─────────────────────────────────────────── */}
      <div className="relative flex-1 w-full min-h-0">
        {/* Ola Maps WebGL vector div */}
        <div
          ref={mapContainerRef}
          className={`w-full h-full ${mapEngine === "olamaps" ? "block" : "hidden"}`}
        />

        {/* Leaflet fallback div */}
        <div
          ref={leafletContainerRef}
          className={`w-full h-full ${mapEngine === "leaflet" ? "block" : "hidden"}`}
        />

        {/* Loading spinner overlay */}
        {mapEngine === "olamaps" && !mapLoaded && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-xs flex items-center justify-center z-30">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-7 h-7 text-teal-700 animate-spin" />
              <span className="text-xs font-medium text-slate-600">Loading Ola Maps vector tiles…</span>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!selectedRoute && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="bg-white/90 backdrop-blur-xs rounded-2xl px-6 py-4 border border-slate-200 shadow text-center">
              <Layers className="w-7 h-7 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-medium text-slate-500">
                Select a route card to visualize every individual leg on Ola Maps
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
