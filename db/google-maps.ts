import { readPrivateSetting } from "./settings";

export type DefaultMapLocation = {
  label: string;
  latitude: number;
  longitude: number;
  placeId?: string;
  source: "google-geocoding" | "mapbox-geocoding" | "fallback";
};

export type MapProvider = "google" | "mapbox";

export async function getMapConfiguration() {
  const providerSetting = await readPrivateSetting("map_provider");
  const provider: MapProvider = providerSetting === "mapbox" ? "mapbox" : "google";
  const [googleKey, mapboxToken] = await Promise.all([
    readPrivateSetting("google_maps_api"),
    readPrivateSetting("mapbox_access_token"),
  ]);
  return {
    provider,
    googleKey,
    mapboxToken,
    selectedKey: provider === "mapbox" ? mapboxToken : googleKey,
  };
}

const fallback: DefaultMapLocation = {
  label: "Belo Horizonte, Minas Gerais, Brasil",
  latitude: -19.9166813,
  longitude: -43.9344931,
  source: "fallback",
};

let cached: { provider: MapProvider; value: DefaultMapLocation; expiresAt: number } | null = null;

export async function getBeloHorizonteDefaultLocation(): Promise<DefaultMapLocation> {
  const configuration = await getMapConfiguration();
  if (cached && cached.provider === configuration.provider && cached.expiresAt > Date.now()) return cached.value;
  if (!configuration.selectedKey) return fallback;
  try {
    if (configuration.provider === "mapbox") {
      const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
      url.searchParams.set("q", "Belo Horizonte, Minas Gerais, Brasil");
      url.searchParams.set("country", "BR");
      url.searchParams.set("language", "pt");
      url.searchParams.set("limit", "1");
      url.searchParams.set("permanent", "true");
      url.searchParams.set("access_token", configuration.mapboxToken);
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      const payload = await response.json() as { features?: Array<{ id?: string; geometry?: { coordinates?: number[] }; properties?: { full_address?: string; name?: string; coordinates?: { latitude?: number; longitude?: number } } }> };
      const result = payload.features?.[0];
      const latitude = result?.properties?.coordinates?.latitude ?? result?.geometry?.coordinates?.[1];
      const longitude = result?.properties?.coordinates?.longitude ?? result?.geometry?.coordinates?.[0];
      if (!response.ok || typeof latitude !== "number" || typeof longitude !== "number") return fallback;
      const value: DefaultMapLocation = { label: result?.properties?.full_address || result?.properties?.name || fallback.label, latitude, longitude, placeId: result?.id, source: "mapbox-geocoding" };
      cached = { provider: configuration.provider, value, expiresAt: Date.now() + 6 * 60 * 60 * 1000 };
      return value;
    }
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", "Belo Horizonte, Minas Gerais, Brasil");
    url.searchParams.set("region", "br");
    url.searchParams.set("language", "pt-BR");
    url.searchParams.set("key", configuration.googleKey);
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    const payload = await response.json() as { status?: string; results?: Array<{ formatted_address?: string; place_id?: string; geometry?: { location?: { lat?: number; lng?: number } } }> };
    const result = payload.results?.[0]; const lat = result?.geometry?.location?.lat; const lng = result?.geometry?.location?.lng;
    if (!response.ok || payload.status !== "OK" || typeof lat !== "number" || typeof lng !== "number") return fallback;
    const value: DefaultMapLocation = { label: result?.formatted_address || fallback.label, latitude: lat, longitude: lng, placeId: result?.place_id, source: "google-geocoding" };
    cached = { provider: configuration.provider, value, expiresAt: Date.now() + 6 * 60 * 60 * 1000 };
    return value;
  } catch { return fallback; }
}
