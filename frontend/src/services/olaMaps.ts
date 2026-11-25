// ─── Ola Maps Web Services & Routing Integration ─────────────────────────────
import axios from "axios";
import { StandardizedLocation, LocationSource } from "../types";

export const OLA_MAPS_KEY =
  import.meta.env.VITE_OLA_MAPS_API_KEY || "C5OsY3W874iSu9UMcfar29kbNXPX4CyZotfvRdye";

export const OLA_MAPS_LIGHT_STYLE = `https://api.olamaps.io/tiles/vector/v1/styles/default-light-standard/style.json?api_key=${OLA_MAPS_KEY}`;
export const OLA_MAPS_DARK_STYLE = `https://api.olamaps.io/tiles/vector/v1/styles/default-dark-standard/style.json?api_key=${OLA_MAPS_KEY}`;

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
 * Loads the Ola Maps style JSON and injects the API key into all sub-resources
 * (sources, sprite, glyphs). This ensures MapLibre never makes an unauthenticated request.
 */
export async function getOlaMapsStyleObject(theme: "roadmap" | "dark" = "roadmap"): Promise<any> {
  const styleName = theme === "dark" ? "default-dark-standard" : "default-light-standard";
  const url = `https://api.olamaps.io/tiles/vector/v1/styles/${styleName}/style.json?api_key=${OLA_MAPS_KEY}`;

  try {
    const res = await axios.get(url, { timeout: 7000 });
    const style = res.data;

    // Inject api_key into sources
    if (style.sources) {
      Object.keys(style.sources).forEach((srcKey) => {
        const src = style.sources[srcKey];
        if (src && src.url && src.url.includes("olamaps.io") && !src.url.includes("api_key=")) {
          const sep = src.url.includes("?") ? "&" : "?";
          src.url = `${src.url}${sep}api_key=${OLA_MAPS_KEY}`;
        }
      });
    }

    // Inject api_key into sprite
    if (style.sprite && style.sprite.includes("olamaps.io") && !style.sprite.includes("api_key=")) {
      const sep = style.sprite.includes("?") ? "&" : "?";
      style.sprite = `${style.sprite}${sep}api_key=${OLA_MAPS_KEY}`;
    }

    // Inject api_key into glyphs
    if (style.glyphs && style.glyphs.includes("olamaps.io") && !style.glyphs.includes("api_key=")) {
      const sep = style.glyphs.includes("?") ? "&" : "?";
      style.glyphs = `${style.glyphs}${sep}api_key=${OLA_MAPS_KEY}`;
    }

    return style;
  } catch (err) {
    console.warn("Could not pre-fetch Ola Maps style JSON, falling back to direct style URL:", err);
    return theme === "dark" ? OLA_MAPS_DARK_STYLE : OLA_MAPS_LIGHT_STYLE;
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
    const url = `https://api.olamaps.io/places/v1/reverse-geocode`;
    const res = await axios.get(url, {
      params: {
        latlng: `${lat},${lon}`,
        api_key: OLA_MAPS_KEY,
      },
      timeout: 4000,
    });

    if (res.data && res.data.results?.length > 0) {
      const first = res.data.results[0];
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
    const url = `https://api.olamaps.io/places/v1/autocomplete`;
    const params: Record<string, any> = {
      input: query.trim(),
      api_key: OLA_MAPS_KEY,
    };
    if (lat !== undefined && lon !== undefined) {
      params.location = `${lat},${lon}`;
    }

    const res = await axios.get(url, { params, timeout: 4000 });

    if (res.data && res.data.predictions?.length > 0) {
      return res.data.predictions.map((p: any) => {
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
