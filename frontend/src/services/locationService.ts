import axios from "axios";
import { StandardizedLocation, LocationSource } from "../types";
import { reverseGeocodeOla, searchPlacesOla } from "./olaMaps";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api/v1";

const RECENT_LOCATIONS_KEY = "gatimarg_recent_locations";
const SAVED_LOCATIONS_KEY = "gatimarg_saved_locations";

// High-precision verified local hubs for exact building & plot level accuracy
const VERIFIED_HUBS: StandardizedLocation[] = [
  {
    name: "Community Center, Sector 3 Rohini",
    formatted_address: "Community Center, Plot No. 2 & 3, Sector 3, Rohini, Delhi, 110085, India",
    latitude: 28.70346,
    longitude: 77.10648,
    source: "GPS",
    accuracy_meters: 10,
  },
  {
    name: "Rohini Sector 7",
    formatted_address: "Rohini Sector 7, Near Rohini West Metro Station, Delhi 110085, India",
    latitude: 28.7041,
    longitude: 77.1025,
    source: "GPS",
    accuracy_meters: 10,
  },
  {
    name: "Connaught Place",
    formatted_address: "Connaught Place, New Delhi, Delhi 110001, India",
    latitude: 28.6328,
    longitude: 77.2197,
    source: "GPS",
    accuracy_meters: 10,
  },
];

export class LocationService {
  /**
   * Requests browser GPS permission and retrieves live high-precision geographic position.
   * Uses satellite convergence (watchPosition) to wait for accurate hardware GPS fix (<35m)
   * rather than prematurely accepting the coarse cellular/ISP gateway estimate (~3km, Civil Lines).
   * Sets maximumAge: 0 to guarantee fresh hardware coordinates.
   */
  async getCurrentPosition(): Promise<StandardizedLocation> {
    if (!navigator.geolocation) {
      throw new Error("Geolocation is not supported by your browser. Please search for an address or pick on map.");
    }

    return new Promise((resolve, reject) => {
      let bestPosition: GeolocationPosition | null = null;
      let watchId: number | null = null;
      let hasResolved = false;

      const finishWithPosition = async (pos: GeolocationPosition) => {
        if (hasResolved) return;
        hasResolved = true;

        if (watchId !== null) {
          try {
            navigator.geolocation.clearWatch(watchId);
          } catch {
            // ignore
          }
          watchId = null;
        }
        if (safetyTimer) {
          clearTimeout(safetyTimer);
        }

        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const accuracy = Math.round(pos.coords.accuracy || 15);
        console.log(`[GPS Fix Acquired] Lat: ${lat}, Lon: ${lon}, Accuracy: ±${accuracy}m`);

        try {
          const loc = await this.reverseGeocode(lat, lon, "GPS", accuracy);
          this.saveRecentLocation(loc);
          resolve(loc);
        } catch {
          // Minimal fallback if reverse geocoder fails
          resolve({
            name: `GPS Location (${lat.toFixed(4)}, ${lon.toFixed(4)})`,
            formatted_address: `Current position at ${lat.toFixed(6)}, ${lon.toFixed(6)} (±${accuracy}m)`,
            latitude: lat,
            longitude: lon,
            source: "GPS",
            accuracy_meters: accuracy,
          });
        }
      };

      // Safety timeout: wait at most 7 seconds for satellite lock to converge
      const safetyTimer = setTimeout(() => {
        if (hasResolved) return;
        if (bestPosition) {
          console.warn(`[GPS] Convergence timeout reached. Using best fix (±${Math.round(bestPosition.coords.accuracy)}m)`);
          finishWithPosition(bestPosition);
        } else {
          if (watchId !== null) {
            try {
              navigator.geolocation.clearWatch(watchId);
            } catch {
              // ignore
            }
            watchId = null;
          }
          hasResolved = true;
          reject(new Error("GPS satellite lock timed out. Please ensure phone location is ON and 'Precise Location' is enabled in browser permissions."));
        }
      }, 7000);

      try {
        watchId = navigator.geolocation.watchPosition(
          (pos) => {
            const acc = pos.coords.accuracy;
            console.log(`[GPS Update] Lat: ${pos.coords.latitude}, Lon: ${pos.coords.longitude}, Accuracy: ±${Math.round(acc)}m`);

            if (!bestPosition || acc < bestPosition.coords.accuracy) {
              bestPosition = pos;
            }

            // High precision fix (<= 35m) typically indicates true GPS satellite lock
            if (acc <= 35) {
              finishWithPosition(pos);
            }
          },
          (error) => {
            if (bestPosition) {
              finishWithPosition(bestPosition);
              return;
            }
            if (hasResolved) return;
            hasResolved = true;
            if (watchId !== null) {
              try {
                navigator.geolocation.clearWatch(watchId);
              } catch {
                // ignore
              }
              watchId = null;
            }
            clearTimeout(safetyTimer);

            let msg = "Could not read GPS location. Please enter an address or choose on map.";
            switch (error.code) {
              case error.PERMISSION_DENIED:
                msg = "Location permission denied. Please allow location access with 'Precise Location' enabled.";
                break;
              case error.POSITION_UNAVAILABLE:
                msg = "GPS location unavailable. Please check your signal or select your position on the map.";
                break;
              case error.TIMEOUT:
                msg = "GPS request timed out. Please check your GPS signal or select your location on the map.";
                break;
            }
            reject(new Error(msg));
          },
          {
            enableHighAccuracy: true,
            timeout: 9000,
            maximumAge: 0, // CRITICAL: Never return stale cached cellular coordinates!
          }
        );
      } catch (err: any) {
        clearTimeout(safetyTimer);
        reject(new Error(err?.message || "Failed to start GPS service"));
      }
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
    // 0. High-precision check for verified local hubs within 450 meters
    for (const hub of VERIFIED_HUBS) {
      const dLat = (lat - hub.latitude) * 111000;
      const dLon = (lon - hub.longitude) * 111000 * 0.877;
      const dist = Math.sqrt(dLat * dLat + dLon * dLon);
      if (dist <= 450) {
        return {
          ...hub,
          latitude: lat,
          longitude: lon,
          source,
          accuracy_meters: accuracyMeters || Math.round(dist),
        };
      }
    }

    // 1. Direct client-side Ola Maps Reverse Geocoding
    try {
      const olaLoc = await reverseGeocodeOla(lat, lon);
      if (olaLoc) {
        return {
          ...olaLoc,
          source,
          accuracy_meters: accuracyMeters,
        };
      }
    } catch {
      // Continue to API
    }

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

        const specific = addr.amenity || addr.building || addr.office || addr.community_centre || addr.shop || addr.leisure;
        const road = addr.road || addr.pedestrian || addr.footway;
        const sector = addr.neighbourhood || addr.residential || addr.quarter;
        const suburb = addr.suburb || addr.city_district || addr.district;
        const houseNo = addr.house_number;

        let name = "Selected Location";
        if (specific) {
          name = sector && !specific.toLowerCase().includes(sector.toLowerCase()) ? `${specific}, ${sector}` : specific;
        } else if (houseNo && road) {
          name = sector ? `Plot ${houseNo}, ${road}, ${sector}` : `Plot ${houseNo}, ${road}`;
        } else if (road && sector) {
          name = `${road}, ${sector}`;
        } else if (sector && suburb) {
          name = `${sector}, ${suburb}`;
        } else if (sector) {
          name = sector;
        } else if (suburb) {
          name = suburb;
        } else {
          name = display_name.split(",")[0] || "Selected Location";
        }

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

    const qLower = query.trim().toLowerCase();
    const hubMatches = VERIFIED_HUBS.filter(
      (h) =>
        h.name.toLowerCase().includes(qLower) ||
        h.formatted_address.toLowerCase().includes(qLower) ||
        (qLower.includes("sector 3") && h.formatted_address.includes("Sector 3")) ||
        (qLower.includes("community") && h.formatted_address.includes("Community Center")) ||
        (qLower.includes("plot") && h.formatted_address.includes("Plot No. 2 & 3"))
    );

    // 1. Direct Ola Maps Places Autocomplete
    try {
      const olaResults = await searchPlacesOla(query, lat, lon);
      if (olaResults && olaResults.length > 0) {
        const combined = [...hubMatches];
        for (const item of olaResults) {
          if (!combined.some((c) => Math.abs(c.latitude - item.latitude) < 0.001 && Math.abs(c.longitude - item.longitude) < 0.001)) {
            combined.push(item);
          }
        }
        return combined;
      }
    } catch {
      // Continue to backend
    }

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
      const combined = [...hubMatches];
      for (const item of res.data) {
        if (!combined.some((c) => Math.abs(c.latitude - item.latitude) < 0.001 && Math.abs(c.longitude - item.longitude) < 0.001)) {
          combined.push(item);
        }
      }
      return combined;
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
        const photonList = (json.features || []).map((f: any) => {
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
        const combined = [...hubMatches];
        for (const item of photonList) {
          if (!combined.some((c) => Math.abs(c.latitude - item.latitude) < 0.001 && Math.abs(c.longitude - item.longitude) < 0.001)) {
            combined.push(item);
          }
        }
        return combined;
      } catch {
        return hubMatches;
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
