// ─── Ola Maps Web Services & Routing Integration ─────────────────────────────
import axios from "axios";
import { StandardizedLocation, LocationSource } from "../types";

export const OLA_MAPS_KEY =
  import.meta.env.VITE_OLA_MAPS_API_KEY || "C5OsY3W874iSu9UMcfar29kbNXPX4CyZotfvRdye";

export const OLA_MAPS_LIGHT_STYLE = `https://api.olamaps.io/tiles/vector/v1/styles/default-light-standard/style.json?api_key=${OLA_MAPS_KEY}`;
export const OLA_MAPS_DARK_STYLE = `https://api.olamaps.io/tiles/vector/v1/styles/default-dark-standard/style.json?api_key=${OLA_MAPS_KEY}`;

let cachedLightStyle: any = null;
let cachedDarkStyle: any = null;

export interface OlaDirectionsResult {
  durationText: string;
  distanceText: string;
  durationSeconds: number;
  distanceMeters: number;
  polylinePath: Array<{ lat: number; lng: number }>;
  summary: string;
}

/**
 * Decodes Google/Ola-encoded polyline string into an array of [lat, lon] coordinates.
 */
export function decodePolyline(encoded: string): Array<[number, number]> {
  if (!encoded) return [];
  const poly: Array<[number, number]> = [];
  let index = 0,
    len = encoded.length;
  let lat = 0,
    lng = 0;

  while (index < len) {
    let b: number,
      shift = 0,
      result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    poly.push([Number((lat / 1e5).toFixed(6)), Number((lng / 1e5).toFixed(6))]);
  }
  return poly;
}

/**
 * Loads the Ola Maps style JSON and bakes the API key directly into the tile URL templates.
 * This guarantees MapLibre's background Web Worker never makes an unauthenticated tile request.
 */
export async function getOlaMapsStyleObject(theme: "roadmap" | "dark" = "roadmap"): Promise<any> {
  if (theme === "dark" && cachedDarkStyle) {
    return JSON.parse(JSON.stringify(cachedDarkStyle));
  }
  if (theme !== "dark" && cachedLightStyle) {
    return JSON.parse(JSON.stringify(cachedLightStyle));
  }

  const styleName = theme === "dark" ? "default-dark-standard" : "default-light-standard";
  const url = `https://api.olamaps.io/tiles/vector/v1/styles/${styleName}/style.json?api_key=${OLA_MAPS_KEY}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`Style fetch status: ${res.status}`);
    const style = await res.json();

    // Inject tiles directly into sources with the API key baked into the URL template
    style.sources = {
      openmaptiles: {
        type: "vector",
        tiles: [
          `https://api.olamaps.io/tiles/vector/v1/data/planet/{z}/{x}/{y}.pbf?api_key=${OLA_MAPS_KEY}`,
        ],
        minzoom: 0,
        maxzoom: 14,
      },
      vectordata: {
        type: "vector",
        tiles: [
          `https://api.olamaps.io/tiles/vector/v1/data/vectordata/{z}/{x}/{y}.pbf?api_key=${OLA_MAPS_KEY}`,
        ],
        minzoom: 0,
        maxzoom: 12,
      },
      street: {
        type: "vector",
        tiles: [
          `https://api.olamaps.io/tiles/vector/v1/data/street/{z}/{x}/{y}.pbf?api_key=${OLA_MAPS_KEY}`,
        ],
        minzoom: 0,
        maxzoom: 12,
      },
    };

    // Inject api_key into sprite and glyphs
    style.sprite = `https://api.olamaps.io/tiles/vector/v1/styles/${styleName}/sprite?api_key=${OLA_MAPS_KEY}`;
    style.glyphs = `https://api.olamaps.io/tiles/vector/v1/fonts/{fontstack}/{range}.pbf?api_key=${OLA_MAPS_KEY}`;

    if (theme === "dark") {
      cachedDarkStyle = style;
    } else {
      cachedLightStyle = style;
    }

    return style;
  } catch (err) {
    console.warn("Could not fetch remote Ola Maps style, returning fallback vector style:", err);
    return {
      version: 8,
      name: "Ola Maps",
      sources: {
        openmaptiles: {
          type: "vector",
          tiles: [
            `https://api.olamaps.io/tiles/vector/v1/data/planet/{z}/{x}/{y}.pbf?api_key=${OLA_MAPS_KEY}`,
          ],
          minzoom: 0,
          maxzoom: 14,
        },
      },
      sprite: `https://api.olamaps.io/tiles/vector/v1/styles/default-light-standard/sprite?api_key=${OLA_MAPS_KEY}`,
      glyphs: `https://api.olamaps.io/tiles/vector/v1/fonts/{fontstack}/{range}.pbf?api_key=${OLA_MAPS_KEY}`,
      layers: [
        {
          id: "background",
          type: "background",
          paint: { "background-color": theme === "dark" ? "#1e293b" : "#f1f5f9" },
        },
      ],
    };
  }
}

/**
 * Fetches real-time driving or walking route from Ola Maps Directions API.
 */
export async function fetchOlaLiveDirections(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  mode: "driving" | "walking" = "driving"
): Promise<OlaDirectionsResult | null> {
  try {
    const url = `https://api.olamaps.io/routing/v1/directions`;
    const res = await axios.post(
      url,
      {},
      {
        params: {
          origin: `${originLat},${originLng}`,
          destination: `${destLat},${destLng}`,
          mode,
          api_key: OLA_MAPS_KEY,
        },
        headers: {
          "X-Request-Id": `gatimarg-${Date.now()}`,
        },
        timeout: 6000,
      }
    );

    if (res.data && res.data.status === "SUCCESS" && res.data.routes?.length > 0) {
      const route = res.data.routes[0];
      const leg = route.legs?.[0] || {};
      const distanceMeters = Number(leg.distance || 0);
      const durationSeconds = Number(leg.duration || 0);
      const encoded = route.overview_polyline || "";
      const decoded = decodePolyline(encoded);

      const polylinePath = decoded.map(([lat, lng]) => ({ lat, lng }));

      const distKm = (distanceMeters / 1000).toFixed(1);
      const durMin = Math.round(durationSeconds / 60);

      return {
        durationText: `${durMin} min`,
        distanceText: `${distKm} km`,
        durationSeconds,
        distanceMeters,
        polylinePath,
        summary: route.summary || "Ola Maps Live Road Route",
      };
    }
  } catch (err) {
    console.warn("Ola Maps live directions error:", err);
  }
  return null;
}

/**
 * Reverse-geocodes coordinates into an Indian street-level address using Ola Maps.
 */
export async function reverseGeocodeOla(lat: number, lon: number): Promise<StandardizedLocation | null> {
  try {
    const url = `https://api.olamaps.io/places/v1/reverse-geocode?latlng=${lat},${lon}&api_key=${OLA_MAPS_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (!res.ok) return null;
    const data = await res.json();

    if (data.results && data.results.length > 0) {
      const first = data.results[0];
      const fullAddr = first.formatted_address || "";
      const name = first.name || fullAddr.split(",")[0] || "Selected Location";
      return {
        place_id: first.place_id || `ola-${lat}-${lon}`,
        name: name !== fullAddr ? name : fullAddr.split(",")[0],
        formatted_address: fullAddr,
        latitude: lat,
        longitude: lon,
        source: "MAP_PIN" as LocationSource,
        accuracy_meters: 10,
      };
    }
  } catch (err) {
    console.debug("Ola reverse geocode skipped:", err);
  }
  return null;
}

/**
 * Searches places, stations, landmarks, and addresses using Ola Maps Autocomplete API.
 */
export async function searchPlacesOla(
  query: string,
  lat?: number,
  lon?: number
): Promise<StandardizedLocation[]> {
  if (!query || query.trim().length < 1) return [];

  try {
    let url = `https://api.olamaps.io/places/v1/autocomplete?input=${encodeURIComponent(
      query.trim()
    )}&api_key=${OLA_MAPS_KEY}`;
    if (lat !== undefined && lon !== undefined) {
      url += `&location=${lat},${lon}`;
    }

    const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (!res.ok) return [];
    const data = await res.json();

    if (data.predictions && data.predictions.length > 0) {
      return data.predictions.map((p: any) => {
        const fullDesc = p.description || "";
        const mainText = p.structured_formatting?.main_text || fullDesc.split(",")[0] || query;
        const coords = p.geometry?.location;

        return {
          place_id: p.place_id || p.reference || `ola-place-${Date.now()}`,
          name: mainText,
          formatted_address: fullDesc,
          latitude: coords?.lat ?? 28.6139,
          longitude: coords?.lng ?? 77.209,
          source: "PLACES_AUTOCOMPLETE" as LocationSource,
          accuracy_meters: 15,
        };
      });
    }
  } catch (err) {
    console.debug("Ola places search skipped:", err);
  }
  return [];
}
