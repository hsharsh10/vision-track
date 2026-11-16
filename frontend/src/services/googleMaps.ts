// ─── Google Maps Script Loader ────────────────────────────────────────────────
let isLoaded   = false;
let isLoading  = false;
const callbacks: ((ok: boolean) => void)[] = [];
let hasAuthFailure = false;

/** Global hook set by Google Maps Platform on billing/key failure */
if (typeof window !== "undefined") {
  (window as any).gm_authFailure = () => {
    hasAuthFailure = true;
    console.warn(
      "[GatiMarg] Google Maps auth failed — billing, Maps JS API not enabled, or key restricted. Falling back."
    );
    window.dispatchEvent(new CustomEvent("google-maps-auth-failure"));
    callbacks.forEach((cb) => cb(false));
    callbacks.length = 0;
  };
}

/**
 * Lazily loads the Google Maps JavaScript API (once per session).
 * Returns true when maps.google is ready, false on auth failure.
 */
export const loadGoogleMapsScript = (apiKey: string): Promise<boolean> =>
  new Promise((resolve) => {
    if (hasAuthFailure) { resolve(false); return; }
    if (typeof window !== "undefined" && (window as any).google?.maps) { resolve(true); return; }
    if (isLoaded) { resolve(true); return; }

    callbacks.push(resolve);
    if (isLoading) return;

    isLoading = true;
    const script = document.createElement("script");
    // ⬇ Include geometry & places libraries
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry,directions`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      isLoaded   = true;
      isLoading  = false;
      callbacks.forEach((cb) => cb(true));
      callbacks.length = 0;
    };
    script.onerror = () => {
      isLoading      = false;
      hasAuthFailure = true;
      callbacks.forEach((cb) => cb(false));
      callbacks.length = 0;
    };
    document.head.appendChild(script);
  });

export const isGoogleMapsAuthFailed = () => hasAuthFailure;

// ─── Live Google Maps Directions API ─────────────────────────────────────────

export interface LiveDirectionsResult {
  durationText: string;
  distanceText: string;
  durationSeconds: number;
  distanceMeters: number;
  polylinePath: Array<{ lat: number; lng: number }>;
  summary: string;
}

/**
 * Fetches live driving/transit directions using the Google Maps Directions API.
 * Falls back gracefully if Maps is not available.
 */
export const fetchLiveDirections = async (
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  mode: "DRIVING" | "TRANSIT" | "WALKING" = "DRIVING"
): Promise<LiveDirectionsResult | null> => {
  if (typeof window === "undefined" || !(window as any).google?.maps) return null;

  const directionsService = new google.maps.DirectionsService();
  const travelMode =
    mode === "TRANSIT"
      ? google.maps.TravelMode.TRANSIT
      : mode === "WALKING"
      ? google.maps.TravelMode.WALKING
      : google.maps.TravelMode.DRIVING;

  return new Promise((resolve) => {
    directionsService.route(
      {
        origin: { lat: originLat, lng: originLng },
        destination: { lat: destLat, lng: destLng },
        travelMode,
      },
      (result, status) => {
        if (status !== google.maps.DirectionsStatus.OK || !result) {
          resolve(null);
          return;
        }
        const leg = result.routes[0]?.legs[0];
        if (!leg) { resolve(null); return; }

        const polylinePath: Array<{ lat: number; lng: number }> = [];
        result.routes[0].overview_path.forEach((latLng) =>
          polylinePath.push({ lat: latLng.lat(), lng: latLng.lng() })
        );

        resolve({
          durationText:    leg.duration?.text   || "",
          distanceText:    leg.distance?.text   || "",
          durationSeconds: leg.duration?.value  || 0,
          distanceMeters:  leg.distance?.value  || 0,
          polylinePath,
          summary:         result.routes[0].summary || "",
        });
      }
    );
  });
};

// ─── Geocode a free-text address (using Places API) ───────────────────────────

export interface GeocodedPlace {
  lat: number;
  lng: number;
  name: string;
  formattedAddress: string;
}

export const geocodeAddress = async (address: string): Promise<GeocodedPlace | null> => {
  if (typeof window === "undefined" || !(window as any).google?.maps) return null;

  const geocoder = new google.maps.Geocoder();
  return new Promise((resolve) => {
    geocoder.geocode({ address, region: "in" }, (results, status) => {
      if (status !== google.maps.GeocoderStatus.OK || !results?.length) {
        resolve(null);
        return;
      }
      const r = results[0];
      resolve({
        lat: r.geometry.location.lat(),
        lng: r.geometry.location.lng(),
        name: r.address_components[0]?.long_name || address,
        formattedAddress: r.formatted_address,
      });
    });
  });
};
