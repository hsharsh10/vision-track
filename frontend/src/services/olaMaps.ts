// ─── Ola Maps Web Services & Routing Integration ─────────────────────────────
import axios from "axios";

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
export async function reverseGeocodeOla(lat: number, lon: number): Promise<any | null> {
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
      return {
        place_id: first.place_id,
        name: first.name || first.formatted_address?.split(",")[0] || "Selected Location",
        formatted_address: first.formatted_address || "",
        latitude: lat,
        longitude: lon,
      };
    }
  } catch (err) {
    console.debug("Ola reverse geocode skipped:", err);
  }
  return null;
}
