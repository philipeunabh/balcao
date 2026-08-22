import { NextRequest, NextResponse } from "next/server";
import { getMapConfiguration } from "../../../../db/google-maps";
export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") || "").trim(); if (query.length < 3 || query.length > 180) return NextResponse.json({ results: [] });
  const configuration = await getMapConfiguration(); if (!configuration.selectedKey) return NextResponse.json({ error: `${configuration.provider === "mapbox" ? "Mapbox" : "Google Maps"} não configurado.`, results: [] }, { status: 503 });
  const normalize = (items: Array<{ formatted_address?: string; place_id?: string; geometry?: { location?: { lat?: number; lng?: number } } }>) => items.slice(0, 6).flatMap((result) => { const lat = result.geometry?.location?.lat; const lng = result.geometry?.location?.lng; if (!result.formatted_address || typeof lat !== "number" || typeof lng !== "number") return []; return [{ formattedAddress: result.formatted_address, placeId: result.place_id || "", lat, lng }]; });
  try {
    if (configuration.provider === "mapbox") {
      const mapboxUrl = new URL("https://api.mapbox.com/search/geocode/v6/forward");
      mapboxUrl.searchParams.set("q", query); mapboxUrl.searchParams.set("country", "BR"); mapboxUrl.searchParams.set("language", "pt"); mapboxUrl.searchParams.set("limit", "6"); mapboxUrl.searchParams.set("autocomplete", "true"); mapboxUrl.searchParams.set("permanent", "true"); mapboxUrl.searchParams.set("proximity", "-43.9344931,-19.9166813"); mapboxUrl.searchParams.set("access_token", configuration.mapboxToken);
      const response = await fetch(mapboxUrl, { headers: { Accept: "application/json" } });
      const payload = await response.json() as { message?: string; features?: Array<{ id?: string; geometry?: { coordinates?: number[] }; properties?: { full_address?: string; place_formatted?: string; name?: string; coordinates?: { latitude?: number; longitude?: number } } }> };
      if (!response.ok) return NextResponse.json({ error: payload.message || "Não foi possível consultar o endereço no Mapbox.", results: [] }, { status: 502 });
      const results = (payload.features || []).flatMap((feature) => {
        const lat = feature.properties?.coordinates?.latitude ?? feature.geometry?.coordinates?.[1];
        const lng = feature.properties?.coordinates?.longitude ?? feature.geometry?.coordinates?.[0];
        const formattedAddress = feature.properties?.full_address || [feature.properties?.name, feature.properties?.place_formatted].filter(Boolean).join(", ");
        return formattedAddress && typeof lat === "number" && typeof lng === "number" ? [{ formattedAddress, placeId: feature.id || "", lat, lng }] : [];
      });
      return NextResponse.json({ provider: "mapbox", results }, { headers: { "Cache-Control": "private, max-age=60" } });
    }
    const placesUrl = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json"); placesUrl.searchParams.set("query", query); placesUrl.searchParams.set("region", "br"); placesUrl.searchParams.set("language", "pt-BR"); placesUrl.searchParams.set("key", configuration.googleKey);
    const response = await fetch(placesUrl, { headers: { Accept: "application/json" } });
    const payload = await response.json() as { status?: string; results?: Array<{ formatted_address?: string; place_id?: string; geometry?: { location?: { lat?: number; lng?: number } } }> };
    if (response.ok && (!payload.status || ["OK", "ZERO_RESULTS"].includes(payload.status))) return NextResponse.json({ results: normalize(payload.results || []) }, { headers: { "Cache-Control": "private, max-age=60" } });
    const geocodeUrl = new URL("https://maps.googleapis.com/maps/api/geocode/json"); geocodeUrl.searchParams.set("address", query); geocodeUrl.searchParams.set("region", "br"); geocodeUrl.searchParams.set("language", "pt-BR"); geocodeUrl.searchParams.set("key", configuration.googleKey);
    const fallback = await fetch(geocodeUrl, { headers: { Accept: "application/json" } });
    const fallbackPayload = await fallback.json() as typeof payload;
    if (!fallback.ok || (fallbackPayload.status && !["OK", "ZERO_RESULTS"].includes(fallbackPayload.status))) return NextResponse.json({ error: "Não foi possível consultar o endereço.", results: [] }, { status: 502 });
    return NextResponse.json({ results: normalize(fallbackPayload.results || []) }, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch { return NextResponse.json({ error: "Serviço de endereços indisponível.", results: [] }, { status: 502 }); }
}
