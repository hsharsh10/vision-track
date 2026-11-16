import axios from "axios";
import { StandardizedLocation, LocationSource } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api/v1";

const RECENT_LOCATIONS_KEY = "gatimarg_recent_locations";
const SAVED_LOCATIONS_KEY = "gatimarg_saved_locations";

export class LocationService {
  /**
   * Requests browser GPS permission and retrieves live geographic position.
   * Performs reverse-geocoding to produce a standardized readable location object.
   * Never substitutes a hardcoded dummy location on failure.
   */
  async getCurrentPosition(): Promise<StandardizedLocation> {
    if (!navigator.geolocation) {
      throw new Error("Geolocation is not supported by your browser. Please search for an address or pick on map.");
    }

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          const accuracy = Math.round(position.coords.accuracy || 15);

          try {
            const loc = await this.reverseGeocode(lat, lon, "GPS", accuracy);
            this.saveRecentLocation(loc);
            resolve(loc);
          } catch {
            // Minimal fallback if reverse geocoder fails
            resolve({
              name: `GPS Location (${lat.toFixed(4)}, ${lon.toFixed(4)})`,
              formatted_address: `Current position at ${lat.toFixed(6)}, ${lon.toFixed(6)}`,
              latitude: lat,
              longitude: lon,
              source: "GPS",
              accuracy_meters: accuracy,
            });
          }
        },
        (error) => {
          let msg = "Could not read GPS location. Please enter an address or choose on map.";
          switch (error.code) {
            case error.PERMISSION_DENIED:
              msg = "Location permission denied. Please allow location access in your browser or search for an address.";
              break;
            case error.POSITION_UNAVAILABLE:
              msg = "GPS location unavailable. Please check your signal or select your position on the map.";
              break;
            case error.TIMEOUT:
              msg = "GPS request timed out. Please try again or select your location on the map.";
              break;
          }
          reject(new Error(msg));
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 30000,
        }
      );
    });
  }

  /**
   * Reverse geocodes coordinates (lat, lon) into a standardized location with human-readable address.
   */
  async reverseGeocode(
    lat: number,
    lon: number,
    source: LocationSource = "MAP_PIN",
    accuracyMeters: number = 15
  ): Promise<StandardizedLocation> {
    try {
      const res = await axios.post<StandardizedLocation>(
        `${API_BASE}/location/reverse-geocode`,
        {
          latitude: lat,
          longitude: lon,
          source,
        },
        { timeout: 4000 }
      );
      return {
        ...res.data,
        accuracy_meters: accuracyMeters,
      };
    } catch {
      // Direct client fallback to OpenStreetMap Nominatim
      try {
        const nomRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`,
          { headers: { "Accept-Language": "en" } }
        );
        const data = await nomRes.json();
        const display_name = data.display_name || "";
        const addr = data.address || {};
        const name =
          addr.amenity ||
          addr.building ||
          addr.shop ||
          addr.suburb ||
          addr.road ||
          display_name.split(",")[0] ||
          "Selected Location";

        return {
          place_id: String(data.osm_id || ""),
          name,
          formatted_address: display_name,
          latitude: lat,
          longitude: lon,
          source,
          accuracy_meters: accuracyMeters,
        };
      } catch {
        return {
          name: `Point (${lat.toFixed(4)}, ${lon.toFixed(4)})`,
          formatted_address: `Coordinates: ${lat.toFixed(6)}, ${lon.toFixed(6)}`,
          latitude: lat,
          longitude: lon,
          source,
          accuracy_meters: accuracyMeters,
        };
      }
    }
  }

  /**
   * Autocompletes user search queries for addresses, landmarks, businesses, transit stations.
   * Supports English and Hindi.
   */
  async searchPlaces(
    query: string,
    lat?: number,
    lon?: number,
    country: string = "in"
  ): Promise<StandardizedLocation[]> {
    if (!query || query.trim().length < 1) return [];

    try {
      const params: Record<string, any> = { q: query.trim(), country };
      if (lat !== undefined && lon !== undefined) {
        params.lat = lat;
        params.lon = lon;
      }
      const res = await axios.get<StandardizedLocation[]>(
        `${API_BASE}/location/autocomplete`,
        { params, timeout: 4000 }
      );
      return res.data;
    } catch {
      // Direct client fallback to Photon
      try {
        const biasLat = lat ?? 28.6139;
        const biasLon = lon ?? 77.209;
        const encoded = encodeURIComponent(query.trim());
        const resp = await fetch(
          `https://photon.komoot.io/api/?q=${encoded}&lat=${biasLat}&lon=${biasLon}&limit=8`
        );
        const json = await resp.json();
        return (json.features || []).map((f: any) => {
          const p = f.properties || {};
          const c = f.geometry?.coordinates || [biasLon, biasLat];
          const name = p.name || query.trim();
          const parts = [p.street, p.suburb, p.city, p.state, p.country].filter(Boolean);
          return {
            place_id: String(p.osm_id || ""),
            name,
            formatted_address: parts.length > 0 ? `${name}, ${parts.join(", ")}` : name,
            latitude: c[1],
            longitude: c[0],
            source: "PLACES_AUTOCOMPLETE" as LocationSource,
            accuracy_meters: 15,
          };
        });
      } catch {
        return [];
      }
    }
  }

  // ─── Recent Locations ─────────────────────────────────────────────────────
  getRecentLocations(): StandardizedLocation[] {
    try {
      const raw = localStorage.getItem(RECENT_LOCATIONS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  saveRecentLocation(location: StandardizedLocation): void {
    try {
      const existing = this.getRecentLocations();
      // Deduplicate by name & proximity
      const filtered = existing.filter(
        (l) =>
          l.name.toLowerCase() !== location.name.toLowerCase() &&
          !(
            Math.abs(l.latitude - location.latitude) < 0.001 &&
            Math.abs(l.longitude - location.longitude) < 0.001
          )
      );
      const updated = [location, ...filtered].slice(0, 8);
      localStorage.setItem(RECENT_LOCATIONS_KEY, JSON.stringify(updated));
    } catch {
      // Ignore storage errors
    }
  }

  clearRecentLocations(): void {
    try {
      localStorage.removeItem(RECENT_LOCATIONS_KEY);
    } catch {}
  }

  // ─── Saved Places (Home, Work, Starred) ───────────────────────────────────
  getSavedPlaces(): { home?: StandardizedLocation; work?: StandardizedLocation } {
    try {
      const raw = localStorage.getItem(SAVED_LOCATIONS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  savePlace(type: "home" | "work", location: StandardizedLocation): void {
    try {
      const places = this.getSavedPlaces();
      places[type] = location;
      localStorage.setItem(SAVED_LOCATIONS_KEY, JSON.stringify(places));
    } catch {}
  }
}

export const locationService = new LocationService();
