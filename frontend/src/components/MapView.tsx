import React, { useEffect, useRef, useState, useCallback } from "react";
import { RouteOption, RouteLeg, ModeType, StandardizedLocation } from "../types";
import { loadGoogleMapsScript } from "../services/googleMaps";
import { locationService } from "../services/locationService";
import { useMobilityStore } from "../store/mobilityStore";
import { Layers, AlertTriangle, Loader2, Sun, Moon, Map as MapIcon, Globe, Crosshair } from "lucide-react";
import L from "leaflet";

const GOOGLE_MAPS_KEY =
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY ||
  "AIzaSyCqh4jRK4ZKwsmHn7PyNLYlAf0UbGxlnjI";

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

const getSegmentWeight = (mode: string): number =>
  mode === "METRO" || mode === "BUS" ? 5 : mode === "WALK" ? 3 : 4;

const createPinIcon = (color: string, letter: string) =>
  L.divIcon({
    className: "custom-map-pin",
    html: `
      <div style="position:relative; width:36px; height:36px; display:flex; align-items:center; justify-content:center; cursor:grab;">
        <div style="width:28px; height:28px; border-radius:50%; background:${color}; border:3px solid #ffffff; box-shadow:0 4px 12px rgba(0,0,0,0.35); display:flex; align-items:center; justify-content:center; color:#ffffff; font-weight:bold; font-size:12px;">
          ${letter}
        </div>
        <div style="position:absolute; bottom:-6px; left:14px; width:0; height:0; border-left:4px solid transparent; border-right:4px solid transparent; border-top:8px solid ${color};"></div>
      </div>
    `,
    iconSize: [36, 42],
    iconAnchor: [18, 40],
  });

const createGpsIcon = () =>
  L.divIcon({
    className: "custom-map-pin",
    html: `
      <div class="pulse-gps-marker">
        <div class="gps-ring"></div>
        <div class="gps-dot"></div>
      </div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });

interface Props {
  selectedRoute: RouteOption | null;
}

type MapTheme = "roadmap" | "satellite" | "dark";
type MapEngine = "google" | "leaflet";

const DARK_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#212121" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#212121" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#373737" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212121" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3c3c3c" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#000000" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#3d3d3d" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f3948" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#2d2d2d" }] },
];

export const MapView: React.FC<Props> = ({ selectedRoute }) => {
  const {
    setPickupLocation,
    setDestLocation,
    currentGPSLocation,
  } = useMobilityStore();

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletContainerRef = useRef<HTMLDivElement>(null);

  // Google Maps instances
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  // Leaflet instances
  const leafletMapRef = useRef<L.Map | null>(null);
  const leafletLayersRef = useRef<L.LayerGroup | null>(null);
  const leafletTileLayerRef = useRef<L.TileLayer | null>(null);

  const [mapEngine, setMapEngine] = useState<MapEngine>("leaflet");
  const [mapTheme, setMapTheme] = useState<MapTheme>("roadmap");
  const [mapLoaded, setMapLoaded] = useState(false);
  const [googleMapsAuthFailed, setGoogleMapsAuthFailed] = useState(false);
  const [liveRouteLoading, setLiveRouteLoading] = useState(false);
  const [liveRouteInfo, setLiveRouteInfo] = useState<string | null>(null);

  // Helper to extract legs
  const getLegs = (route: RouteOption | null): RouteLeg[] => {
    if (!route) return [];
    if (route.legs && route.legs.length > 0) return route.legs;
    return route.segments || [];
  };

  // ─── Initialize Google Map ────────────────────────────────────────────────
  const initGoogleMap = useCallback(() => {
    if (!mapContainerRef.current || googleMapRef.current) return;

    try {
      const map = new google.maps.Map(mapContainerRef.current, {
        center: { lat: 28.6139, lng: 77.209 }, // Delhi center
        zoom: 12,
        mapTypeId: "roadmap",
        disableDefaultUI: false,
        zoomControl: true,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: true,
        gestureHandling: "cooperative",
        styles: [],
      });

      googleMapRef.current = map;
      const infoWindow = new google.maps.InfoWindow();
      infoWindowRef.current = infoWindow;
      setMapLoaded(true);

      // Click to choose pickup or destination directly on map
      map.addListener("click", (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        const lat = e.latLng.lat();
        const lng = e.latLng.lng();
        infoWindow.setContent(`
          <div style="font-family: system-ui, sans-serif; padding: 6px; font-size: 12px; min-width: 170px;">
            <div style="font-weight: bold; margin-bottom: 4px; color: #0f172a;">Set Map Location</div>
            <div style="font-size: 10px; color: #64748b; margin-bottom: 8px;">${lat.toFixed(4)}, ${lng.toFixed(4)}</div>
            <div style="display: flex; gap: 6px;">
              <button id="gmap-set-pickup" style="background:#10B981; color:white; border:none; padding:4px 8px; border-radius:6px; font-size:11px; cursor:pointer; font-weight:bold;">Set Pickup</button>
              <button id="gmap-set-dest" style="background:#EF4444; color:white; border:none; padding:4px 8px; border-radius:6px; font-size:11px; cursor:pointer; font-weight:bold;">Set Destination</button>
            </div>
          </div>
        `);
        infoWindow.setPosition(e.latLng);
        infoWindow.open(map);

        setTimeout(() => {
          document.getElementById("gmap-set-pickup")?.addEventListener("click", async () => {
            infoWindow.close();
            const loc = await locationService.reverseGeocode(lat, lng, "MAP_PIN");
            setPickupLocation(loc);
          });
          document.getElementById("gmap-set-dest")?.addEventListener("click", async () => {
            infoWindow.close();
            const loc = await locationService.reverseGeocode(lat, lng, "MAP_PIN");
            setDestLocation(loc);
          });
        }, 50);
      });
    } catch (err) {
      console.warn("Google Maps init exception, switching to Leaflet:", err);
      setGoogleMapsAuthFailed(true);
      setMapEngine("leaflet");
    }
  }, [setPickupLocation, setDestLocation]);

  // ─── Initialize Leaflet Map ───────────────────────────────────────────────
  const initLeafletMap = useCallback(() => {
    if (!leafletContainerRef.current || leafletMapRef.current) return;

    const lmap = L.map(leafletContainerRef.current, {
      center: [28.6139, 77.209],
      zoom: 12,
      zoomControl: true,
    });

    // High-resolution Google Maps tiles (Roadmap, Satellite Hybrid, Dark)
    const getGoogleTileUrl = (theme: MapTheme) => {
      switch (theme) {
        case "satellite":
          return "https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}";
        case "dark":
        case "roadmap":
        default:
          return "https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}";
      }
    };

    const tileLayer = L.tileLayer(getGoogleTileUrl(mapTheme), {
      subdomains: ["0", "1", "2", "3"],
      maxZoom: 20,
      attribution: "© Google Maps",
    }).addTo(lmap);

    leafletTileLayerRef.current = tileLayer;

    const layerGroup = L.layerGroup().addTo(lmap);
    leafletMapRef.current = lmap;
    leafletLayersRef.current = layerGroup;

    // Click anywhere to set pickup or destination
    lmap.on("click", (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      const popupContent = `
        <div style="font-family: system-ui, sans-serif; font-size: 12px; min-width: 170px;">
          <div style="font-weight: bold; margin-bottom: 4px; color: #0f172a;">Set Map Location</div>
          <div style="font-size: 10px; color: #64748b; margin-bottom: 8px;">${lat.toFixed(4)}, ${lng.toFixed(4)}</div>
          <div style="display: flex; gap: 6px;">
            <button id="leaflet-set-pickup" style="background:#10B981; color:white; border:none; padding:4px 8px; border-radius:6px; font-size:11px; cursor:pointer; font-weight:bold;">Set Pickup</button>
            <button id="leaflet-set-dest" style="background:#EF4444; color:white; border:none; padding:4px 8px; border-radius:6px; font-size:11px; cursor:pointer; font-weight:bold;">Set Destination</button>
          </div>
        </div>
      `;
      L.popup().setLatLng(e.latlng).setContent(popupContent).openOn(lmap);

      setTimeout(() => {
        document.getElementById("leaflet-set-pickup")?.addEventListener("click", async () => {
          lmap.closePopup();
          const loc = await locationService.reverseGeocode(lat, lng, "MAP_PIN");
          setPickupLocation(loc);
        });
        document.getElementById("leaflet-set-dest")?.addEventListener("click", async () => {
          lmap.closePopup();
          const loc = await locationService.reverseGeocode(lat, lng, "MAP_PIN");
          setDestLocation(loc);
        });
      }, 50);
    });
  }, [setPickupLocation, setDestLocation]);

  // ─── Load Google Maps SDK ─────────────────────────────────────────────────
  useEffect(() => {
    loadGoogleMapsScript(GOOGLE_MAPS_KEY).then((success) => {
      if (success) {
        initGoogleMap();
      } else {
        setGoogleMapsAuthFailed(true);
        setMapEngine("leaflet");
      }
    });

    const onAuthFail = () => {
      setGoogleMapsAuthFailed(true);
      setMapEngine("leaflet");
    };
    window.addEventListener("google-maps-auth-failure", onAuthFail);
    return () => window.removeEventListener("google-maps-auth-failure", onAuthFail);
  }, [initGoogleMap]);

  // Init leaflet if active engine is leaflet
  useEffect(() => {
    if (mapEngine === "leaflet") {
      initLeafletMap();
    }
  }, [mapEngine, initLeafletMap]);

  // ─── Apply Google Map Theme ───────────────────────────────────────────────
  useEffect(() => {
    const map = googleMapRef.current;
    if (!map) return;
    if (mapTheme === "dark") {
      map.setOptions({ styles: DARK_MAP_STYLES, mapTypeId: "roadmap" });
    } else if (mapTheme === "satellite") {
      map.setOptions({ styles: [], mapTypeId: "satellite" });
    } else {
      map.setOptions({ styles: [], mapTypeId: "roadmap" });
    }
  }, [mapTheme]);

  // ─── Apply Leaflet Theme ──────────────────────────────────────────────────
  useEffect(() => {
    if (leafletContainerRef.current) {
      if (mapTheme === "dark") {
        leafletContainerRef.current.classList.add("leaflet-dark-tiles");
      } else {
        leafletContainerRef.current.classList.remove("leaflet-dark-tiles");
      }
    }
    if (leafletTileLayerRef.current) {
      const url =
        mapTheme === "satellite"
          ? "https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
          : "https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}";
      leafletTileLayerRef.current.setUrl(url);
    }
  }, [mapTheme]);

  // ─── Clear Overlays Helper ────────────────────────────────────────────────
  const clearGoogleOverlays = () => {
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    infoWindowRef.current?.close();
    setLiveRouteInfo(null);
  };

  const clearLeafletOverlays = () => {
    if (leafletLayersRef.current) {
      leafletLayersRef.current.clearLayers();
    }
  };

  // ─── Render Google Maps Multi-Segment Route ───────────────────────────────
  const renderGoogleRoute = useCallback(() => {
    const map = googleMapRef.current;
    if (!map || !selectedRoute) return;

    clearGoogleOverlays();
    const legs = getLegs(selectedRoute);
    if (legs.length === 0) return;

    const bounds = new google.maps.LatLngBounds();
    const infoWindow = infoWindowRef.current!;

    // 1. Draw each individual leg polyline with specific styles
    legs.forEach((leg, index) => {
      let coords: Array<{ lat: number; lng: number }> = [];

      // Check decoded_coordinates or path_coords
      if (leg.decoded_coordinates && leg.decoded_coordinates.length > 0) {
        coords = leg.decoded_coordinates.map((c) => ({ lat: c[0], lng: c[1] }));
      } else if (leg.path_coords && leg.path_coords.length > 0) {
        coords = leg.path_coords.map((c) => ({ lat: c[0], lng: c[1] }));
      } else if (leg.encoded_polyline && window.google?.maps?.geometry?.encoding) {
        coords = google.maps.geometry.encoding.decodePath(leg.encoded_polyline).map((p) => ({
          lat: p.lat(),
          lng: p.lng(),
        }));
      } else if (leg.start_location && leg.end_location) {
        coords = [
          { lat: leg.start_location.latitude, lng: leg.start_location.longitude },
          { lat: leg.end_location.latitude, lng: leg.end_location.longitude },
        ];
      }

      if (coords.length === 0) return;
      coords.forEach((p) => bounds.extend(p));

      const color = getSegmentColor(leg.mode, leg.line_color);
      const weight = getSegmentWeight(leg.mode);
      const isWalk = leg.mode === "WALK";

      const poly = new google.maps.Polyline({
        path: coords,
        strokeColor: color,
        strokeOpacity: isWalk ? 0 : 0.95,
        strokeWeight: weight,
        icons: isWalk
          ? [
              {
                icon: {
                  path: "M 0,-1 0,1",
                  strokeOpacity: 1,
                  strokeColor: "#EA580C",
                  scale: 3,
                },
                offset: "0",
                repeat: "16px",
              },
            ]
          : [
              // Direction indicator arrow at midpoint of leg
              {
                icon: {
                  path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                  scale: 2.5,
                  strokeColor: "#ffffff",
                  strokeWeight: 1,
                  fillColor: color,
                  fillOpacity: 1,
                },
                offset: "50%",
              },
            ],
        map,
        geodesic: true,
      });

      // Leg Click Popup Info
      poly.addListener("click", (e: google.maps.MapMouseEvent) => {
        const distKm = (leg.distance_meters ? leg.distance_meters / 1000 : (leg.distance_km || 0)).toFixed(2);
        const durMin = Math.round(leg.duration_seconds ? leg.duration_seconds / 60 : (leg.duration_min || 0));
        const fare = Math.round(leg.fare ?? (leg.fare_inr || 0));

        infoWindow.setContent(`
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
        `);
        infoWindow.setPosition(e.latLng);
        infoWindow.open(map);
      });

      polylinesRef.current.push(poly);
    });

    // 2. Green Pickup Marker at origin of Leg 0 (Draggable)
    const firstLeg = legs[0];
    const firstCoords = firstLeg.decoded_coordinates?.[0] ||
      firstLeg.path_coords?.[0] || [firstLeg.start_location?.latitude, firstLeg.start_location?.longitude];

    if (firstCoords && firstCoords[0] && firstCoords[1]) {
      const originMarker = new google.maps.Marker({
        position: { lat: firstCoords[0], lng: firstCoords[1] },
        map,
        draggable: true,
        title: `Pickup: ${firstLeg.start_location?.name || firstLeg.from_name || "Pickup Point"} (Drag to move)`,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: "#10B981", // Green
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2.5,
        },
        zIndex: 100,
      });

      originMarker.addListener("dragend", async (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        const lat = e.latLng.lat();
        const lng = e.latLng.lng();
        const loc = await locationService.reverseGeocode(lat, lng, "MAP_PIN");
        setPickupLocation(loc);
      });

      originMarker.addListener("click", () => {
        infoWindow.setContent(`
          <div style="font-family: system-ui, sans-serif; padding: 4px; font-size: 12px;">
            <strong style="color: #059669;">🟢 Pickup Location (Draggable)</strong><br/>
            ${firstLeg.start_location?.name || firstLeg.from_name}
          </div>
        `);
        infoWindow.open(map, originMarker);
      });
      markersRef.current.push(originMarker);
    }

    // 3. Red Destination Marker at destination of last leg (Draggable)
    const lastLeg = legs[legs.length - 1];
    const lastCoordsArr = lastLeg.decoded_coordinates || lastLeg.path_coords || [];
    const lastPoint = lastCoordsArr.length > 0
      ? lastCoordsArr[lastCoordsArr.length - 1]
      : [lastLeg.end_location?.latitude, lastLeg.end_location?.longitude];

    if (lastPoint && lastPoint[0] && lastPoint[1]) {
      const destMarker = new google.maps.Marker({
        position: { lat: lastPoint[0], lng: lastPoint[1] },
        map,
        draggable: true,
        title: `Destination: ${lastLeg.end_location?.name || lastLeg.to_name || "Destination"} (Drag to move)`,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: "#EF4444", // Red
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2.5,
        },
        zIndex: 100,
      });

      destMarker.addListener("dragend", async (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        const lat = e.latLng.lat();
        const lng = e.latLng.lng();
        const loc = await locationService.reverseGeocode(lat, lng, "MAP_PIN");
        setDestLocation(loc);
      });

      destMarker.addListener("click", () => {
        infoWindow.setContent(`
          <div style="font-family: system-ui, sans-serif; padding: 4px; font-size: 12px;">
            <strong style="color: #dc2626;">🔴 Final Destination (Draggable)</strong><br/>
            ${lastLeg.end_location?.name || lastLeg.to_name}
          </div>
        `);
        infoWindow.open(map, destMarker);
      });
      markersRef.current.push(destMarker);
    }

    // Live GPS Marker if active
    if (currentGPSLocation) {
      const gpsLat = currentGPSLocation.latitude;
      const gpsLng = currentGPSLocation.longitude;
      const gpsMarker = new google.maps.Marker({
        position: { lat: gpsLat, lng: gpsLng },
        map,
        title: `Current Location: ${currentGPSLocation.name || "GPS"}`,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: "#2563EB",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2.5,
        },
        zIndex: 110,
      });
      markersRef.current.push(gpsMarker);

      const gpsCircle = new google.maps.Circle({
        map,
        center: { lat: gpsLat, lng: gpsLng },
        radius: currentGPSLocation.accuracy_meters || 30,
        fillColor: "#3B82F6",
        fillOpacity: 0.15,
        strokeColor: "#3B82F6",
        strokeOpacity: 0.5,
        strokeWeight: 1,
      });
      markersRef.current.push(gpsCircle as any);
      bounds.extend({ lat: gpsLat, lng: gpsLng });
    }

    // 4. Yellow Transfer Markers at interchanges between motorized or transit services
    if (legs.length > 1) {
      for (let i = 0; i < legs.length - 1; i++) {
        const cur = legs[i];
        const nxt = legs[i + 1];

        const curCoords = cur.decoded_coordinates || cur.path_coords || [];
        const xferPoint = curCoords.length > 0
          ? curCoords[curCoords.length - 1]
          : [cur.end_location?.latitude, cur.end_location?.longitude];

        if (xferPoint && xferPoint[0] && xferPoint[1]) {
          const xferMarker = new google.maps.Marker({
            position: { lat: xferPoint[0], lng: xferPoint[1] },
            map,
            title: `Transfer from ${cur.mode} to ${nxt.mode}`,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 7,
              fillColor: "#F59E0B", // Yellow
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 2,
            },
            zIndex: 90,
          });

          xferMarker.addListener("click", () => {
            infoWindow.setContent(`
              <div style="font-family: system-ui, sans-serif; padding: 4px; font-size: 12px;">
                <strong style="color: #d97706;">🔄 Transfer Hub</strong><br/>
                ${cur.end_location?.name || cur.to_name}<br/>
                <span style="color:#64748b;font-size:11px;">Change from ${cur.mode} to ${nxt.mode}</span>
              </div>
            `);
            infoWindow.open(map, xferMarker);
          });
          markersRef.current.push(xferMarker);
        }
      }
    }

    // 5. Fit bounds to contain the entire journey
    map.fitBounds(bounds, { top: 60, right: 40, bottom: 40, left: 40 });
  }, [selectedRoute]);

  // ─── Render Leaflet Route (Resilient Fallback & Alternative) ───────────────
  const renderLeafletRoute = useCallback(() => {
    const lmap = leafletMapRef.current;
    const layerGroup = leafletLayersRef.current;
    if (!lmap || !layerGroup || !selectedRoute) return;

    clearLeafletOverlays();
    const legs = getLegs(selectedRoute);
    if (legs.length === 0) return;

    const latLngsBounds: [number, number][] = [];

    legs.forEach((leg, index) => {
      let coords: [number, number][] = [];

      if (leg.decoded_coordinates && leg.decoded_coordinates.length > 0) {
        coords = leg.decoded_coordinates.map((c) => [c[0], c[1]]);
      } else if (leg.path_coords && leg.path_coords.length > 0) {
        coords = leg.path_coords.map((c) => [c[0], c[1]]);
      } else if (leg.start_location && leg.end_location) {
        coords = [
          [leg.start_location.latitude, leg.start_location.longitude],
          [leg.end_location.latitude, leg.end_location.longitude],
        ];
      }

      if (coords.length === 0) return;
      coords.forEach((p) => latLngsBounds.push(p));

      const color = getSegmentColor(leg.mode, leg.line_color);
      const isWalk = leg.mode === "WALK";

      const poly = L.polyline(coords, {
        color,
        weight: getSegmentWeight(leg.mode),
        opacity: isWalk ? 0.9 : 0.95,
        dashArray: isWalk ? "6, 8" : undefined,
      });

      const distKm = (leg.distance_meters ? leg.distance_meters / 1000 : (leg.distance_km || 0)).toFixed(2);
      const durMin = Math.round(leg.duration_seconds ? leg.duration_seconds / 60 : (leg.duration_min || 0));
      const fare = Math.round(leg.fare ?? (leg.fare_inr || 0));

      poly.bindPopup(`
        <div style="font-family: system-ui, sans-serif; font-size: 12px; min-width: 180px;">
          <strong style="color: ${color};">${index + 1}. ${leg.mode} (${leg.provider})</strong><br/>
          <span>${leg.start_location?.name || leg.from_name} → ${leg.end_location?.name || leg.to_name}</span><br/>
          <small style="color: #64748b;">${distKm} km • ${durMin} min • ₹${fare}</small>
        </div>
      `);

      layerGroup.addLayer(poly);
    });

    // Render current GPS Location if available
    if (currentGPSLocation) {
      const gpsLat = currentGPSLocation.latitude;
      const gpsLon = currentGPSLocation.longitude;
      const gpsAccuracy = currentGPSLocation.accuracy_meters || 30;

      const gpsMarker = L.marker([gpsLat, gpsLon], {
        icon: createGpsIcon(),
      }).bindPopup(`<strong>📍 Your Current Location</strong><br/>${currentGPSLocation.name || currentGPSLocation.formatted_address}`);
      layerGroup.addLayer(gpsMarker);

      const gpsCircle = L.circle([gpsLat, gpsLon], {
        radius: gpsAccuracy,
        color: "#3B82F6",
        fillColor: "#60A5FA",
        fillOpacity: 0.15,
        weight: 1.5,
      });
      layerGroup.addLayer(gpsCircle);
      latLngsBounds.push([gpsLat, gpsLon]);
    }

    // Pickup Marker (Draggable Pin)
    const firstLeg = legs[0];
    const firstPoint = firstLeg.decoded_coordinates?.[0] || firstLeg.path_coords?.[0] || [
      firstLeg.start_location?.latitude ?? 0,
      firstLeg.start_location?.longitude ?? 0,
    ];
    if (firstPoint && typeof firstPoint[0] === "number" && typeof firstPoint[1] === "number" && firstPoint[0] !== 0) {
      const origMarker = L.marker([firstPoint[0], firstPoint[1]], {
        draggable: true,
        icon: createPinIcon("#10B981", "P"),
      }).bindPopup(`<strong>🟢 Pickup (Drag to adjust)</strong><br/>${firstLeg.start_location?.name || firstLeg.from_name}`);

      origMarker.on("dragend", async () => {
        const pos = origMarker.getLatLng();
        const loc = await locationService.reverseGeocode(pos.lat, pos.lng, "MAP_PIN");
        setPickupLocation(loc);
      });
      layerGroup.addLayer(origMarker);
    }

    // Destination Marker (Draggable Pin)
    const lastLeg = legs[legs.length - 1];
    const lastArr = lastLeg.decoded_coordinates || lastLeg.path_coords || [];
    const lastPoint = lastArr.length > 0
      ? lastArr[lastArr.length - 1]
      : [lastLeg.end_location?.latitude ?? 0, lastLeg.end_location?.longitude ?? 0];
    if (lastPoint && typeof lastPoint[0] === "number" && typeof lastPoint[1] === "number" && lastPoint[0] !== 0) {
      const destMarker = L.marker([lastPoint[0], lastPoint[1]], {
        draggable: true,
        icon: createPinIcon("#EF4444", "D"),
      }).bindPopup(`<strong>🔴 Destination (Drag to adjust)</strong><br/>${lastLeg.end_location?.name || lastLeg.to_name}`);

      destMarker.on("dragend", async () => {
        const pos = destMarker.getLatLng();
        const loc = await locationService.reverseGeocode(pos.lat, pos.lng, "MAP_PIN");
        setDestLocation(loc);
      });
      layerGroup.addLayer(destMarker);
    }

    // Transfers
    if (legs.length > 1) {
      for (let i = 0; i < legs.length - 1; i++) {
        const cur = legs[i];
        const nxt = legs[i + 1];
        const pts = cur.decoded_coordinates || cur.path_coords || [];
        const pt = pts.length > 0 ? pts[pts.length - 1] : [cur.end_location?.latitude ?? 0, cur.end_location?.longitude ?? 0];
        if (pt && typeof pt[0] === "number" && typeof pt[1] === "number" && pt[0] !== 0) {
          const xfer = L.circleMarker([pt[0], pt[1]], {
            radius: 6,
            color: "#ffffff",
            weight: 2,
            fillColor: "#F59E0B",
            fillOpacity: 1,
          }).bindPopup(`<strong>🔄 Transfer</strong><br/>${cur.end_location?.name || cur.to_name} (${cur.mode} → ${nxt.mode})`);
          layerGroup.addLayer(xfer);
        }
      }
    }

    if (latLngsBounds.length > 0) {
      lmap.fitBounds(L.latLngBounds(latLngsBounds), { padding: [40, 40] });
    }
  }, [selectedRoute]);

  // ─── Trigger Rendering Based on Active Engine ─────────────────────────────
  useEffect(() => {
    if (mapEngine === "google" && mapLoaded) {
      renderGoogleRoute();
    } else if (mapEngine === "leaflet") {
      // Delay slightly for container size settling
      setTimeout(() => {
        if (leafletMapRef.current) {
          leafletMapRef.current.invalidateSize();
          renderLeafletRoute();
        }
      }, 50);
    }
  }, [selectedRoute, mapEngine, mapLoaded, renderGoogleRoute, renderLeafletRoute]);

  return (
    <div className="relative w-full h-[520px] lg:h-[680px] rounded-3xl overflow-hidden border border-slate-200/90 shadow-xs bg-white flex flex-col">
      {/* ── Map Header Bar ──────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between z-20 shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <MapIcon className="w-4 h-4 text-teal-700" />
          <span className="text-xs font-bold text-slate-800">
            Google Maps — Multimodal Route
          </span>
          {selectedRoute && (
            <span className="text-[11px] text-slate-500 font-medium truncate max-w-[200px]">
              • {selectedRoute.title}
            </span>
          )}
        </div>

        {/* Google Maps Layer Switchers */}
        <div className="flex items-center gap-2">
          {/* Theme toggle: Roadmap | Satellite | Dark */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMapTheme("roadmap")}
              title="Google Maps Standard Roadmap"
              className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition border cursor-pointer ${
                mapTheme === "roadmap"
                  ? "bg-teal-700 text-white border-teal-700 shadow-xs"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              🗺️ Roadmap
            </button>
            <button
              onClick={() => setMapTheme("satellite")}
              title="Google Satellite with Streets & Labels"
              className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition border cursor-pointer ${
                mapTheme === "satellite"
                  ? "bg-teal-700 text-white border-teal-700 shadow-xs"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              🛰️ Satellite
            </button>
            <button
              onClick={() => setMapTheme("dark")}
              title="Dark Navigation Theme"
              className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition border cursor-pointer ${
                mapTheme === "dark"
                  ? "bg-teal-700 text-white border-teal-700 shadow-xs"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              🌙 Dark
            </button>
          </div>
        </div>
      </div>

      {/* ── Legend Bar (Section 5 Colors & Markers) ────────────────────────── */}
      <div className="bg-slate-50/90 border-b border-slate-100 px-4 py-1.5 flex items-center gap-4 text-[10px] text-slate-600 shrink-0 flex-wrap">
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
        {/* Google Maps div */}
        <div
          ref={mapContainerRef}
          className={`w-full h-full ${mapEngine === "google" ? "block" : "hidden"}`}
        />

        {/* Leaflet OSM div */}
        <div
          ref={leafletContainerRef}
          className={`w-full h-full ${mapEngine === "leaflet" ? "block" : "hidden"}`}
        />

        {/* Loading spinner overlay */}
        {mapEngine === "google" && (!mapLoaded || liveRouteLoading) && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-xs flex items-center justify-center z-30">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-7 h-7 text-teal-700 animate-spin" />
              <span className="text-xs font-medium text-slate-600">Loading Google Maps route…</span>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!selectedRoute && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="bg-white/90 backdrop-blur-xs rounded-2xl px-6 py-4 border border-slate-200 shadow text-center">
              <Layers className="w-7 h-7 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-medium text-slate-500">
                Select a route card to visualize every individual leg on the map
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
