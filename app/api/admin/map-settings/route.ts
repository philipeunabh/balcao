import { NextResponse } from "next/server";
import { getAdminFromRequest } from "../../../../db/admin-auth";
import { getMapConfiguration, MapProvider } from "../../../../db/google-maps";
import { readPrivateSetting, writePortalSettings } from "../../../../db/settings";

async function authorized(request: Request) { return Boolean(await getAdminFromRequest(request)); }
function hint(value: string) { return value ? `••••${value.slice(-4)}` : null; }
function validProvider(value: unknown): value is MapProvider { return value === "google" || value === "mapbox"; }

async function responseConfiguration() {
  const configuration = await getMapConfiguration();
  return {
    provider: configuration.provider,
    configured: Boolean(configuration.selectedKey),
    googleConfigured: Boolean(configuration.googleKey),
    mapboxConfigured: Boolean(configuration.mapboxToken),
    googleKeyHint: hint(configuration.googleKey),
    mapboxKeyHint: hint(configuration.mapboxToken),
  };
}

function validateCredential(provider: MapProvider, value: string) {
  if (provider === "mapbox" && (!value.startsWith("pk.") || value.length < 40)) return "Informe um token público válido do Mapbox, iniciado por pk..";
  if (provider === "google" && value.length < 20) return "Informe uma chave válida da API do Google Maps.";
  return "";
}

export async function GET(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  return NextResponse.json(await responseConfiguration(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const payload = await request.json().catch(() => ({})) as { provider?: string; google_maps_api?: string; mapbox_access_token?: string };
  if (!validProvider(payload.provider)) return NextResponse.json({ error: "Selecione Google Maps ou Mapbox." }, { status: 400 });
  const credential = payload.provider === "mapbox" ? payload.mapbox_access_token?.trim() || "" : payload.google_maps_api?.trim() || "";
  const savedCredential = credential || await readPrivateSetting(payload.provider === "mapbox" ? "mapbox_access_token" : "google_maps_api");
  const error = validateCredential(payload.provider, savedCredential);
  if (error) return NextResponse.json({ error }, { status: 400 });
  await writePortalSettings({
    map_provider: payload.provider,
    ...(credential ? { [payload.provider === "mapbox" ? "mapbox_access_token" : "google_maps_api"]: credential } : {}),
  });
  return NextResponse.json({ ok: true, ...(await responseConfiguration()) }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const saved = await POST(request);
  if (!saved.ok) return saved;
  const configuration = await getMapConfiguration();
  try {
    if (configuration.provider === "mapbox") {
      const geocodeUrl = new URL("https://api.mapbox.com/search/geocode/v6/forward");
      geocodeUrl.searchParams.set("q", "Praça Sete, Belo Horizonte, MG"); geocodeUrl.searchParams.set("country", "BR"); geocodeUrl.searchParams.set("language", "pt"); geocodeUrl.searchParams.set("limit", "1"); geocodeUrl.searchParams.set("permanent", "true"); geocodeUrl.searchParams.set("access_token", configuration.mapboxToken);
      const styleUrl = new URL("https://api.mapbox.com/styles/v1/mapbox/streets-v12"); styleUrl.searchParams.set("access_token", configuration.mapboxToken);
      const [geocodeResponse, styleResponse] = await Promise.all([fetch(geocodeUrl, { headers: { Accept: "application/json" } }), fetch(styleUrl, { headers: { Accept: "application/json" } })]);
      const geocode = await geocodeResponse.json() as { message?: string; features?: Array<{ geometry?: { coordinates?: number[] }; properties?: { full_address?: string; name?: string; coordinates?: { latitude?: number; longitude?: number } } }> };
      const feature = geocode.features?.[0]; const latitude = feature?.properties?.coordinates?.latitude ?? feature?.geometry?.coordinates?.[1]; const longitude = feature?.properties?.coordinates?.longitude ?? feature?.geometry?.coordinates?.[0];
      const services = {
        geocoding: { ok: geocodeResponse.ok && typeof latitude === "number" && typeof longitude === "number", message: geocodeResponse.ok && typeof latitude === "number" ? "Busca de endereços e coordenadas do Mapbox operacionais." : geocode.message || "A Geocoding API do Mapbox rejeitou o token." },
        maps: { ok: styleResponse.ok, message: styleResponse.ok ? "Mapa interativo e estilo Streets autorizados." : "O token não autorizou o carregamento do mapa Streets." },
      };
      return NextResponse.json({ ...(await responseConfiguration()), ok: Object.values(services).every((item) => item.ok), provider: "mapbox", configured: true, services, defaultLocation: typeof latitude === "number" && typeof longitude === "number" ? { label: feature?.properties?.full_address || feature?.properties?.name || "Belo Horizonte, MG", latitude, longitude, source: "mapbox-geocoding" } : undefined }, { headers: { "Cache-Control": "no-store" } });
    }

    const geocodeUrl = new URL("https://maps.googleapis.com/maps/api/geocode/json"); geocodeUrl.searchParams.set("address", "Praça Sete, Belo Horizonte, MG"); geocodeUrl.searchParams.set("region", "br"); geocodeUrl.searchParams.set("language", "pt-BR"); geocodeUrl.searchParams.set("key", configuration.googleKey);
    const response = await fetch(geocodeUrl, { headers: { Accept: "application/json" } });
    const payload = await response.json() as { status?: string; error_message?: string; results?: Array<{ formatted_address?: string; geometry?: { location?: { lat?: number; lng?: number } } }> };
    const result = payload.results?.[0]; const latitude = result?.geometry?.location?.lat; const longitude = result?.geometry?.location?.lng;
    const geocodingOk = response.ok && payload.status === "OK" && typeof latitude === "number" && typeof longitude === "number";
    return NextResponse.json({ ...(await responseConfiguration()), ok: geocodingOk, provider: "google", configured: true, services: { geocoding: { ok: geocodingOk, message: geocodingOk ? "Geocodificação do Google Maps operacional." : payload.error_message || `Geocoding API respondeu ${payload.status || response.status}.` } }, defaultLocation: geocodingOk ? { label: result?.formatted_address || "Belo Horizonte, MG", latitude, longitude, source: "google-geocoding" } : undefined }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Não foi possível conectar ao provedor de mapas.", services: { connection: { ok: false, message: "O provedor não respondeu ao teste." } } }, { status: 502 });
  }
}
