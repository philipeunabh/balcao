import { NextResponse } from "next/server";
import { getAdminFromRequest } from "../../../../db/admin-auth";
import { readPortalSettings, writePortalSettings } from "../../../../db/settings";
import { SITE_URL } from "../../../../lib/site-url";

const DEFAULT_TITLE = "Portal Balcão — Classificados em Belo Horizonte";
const DEFAULT_DESCRIPTION = "Anúncios classificados de imóveis, veículos, celulares, eletrônicos, serviços e empregos em Belo Horizonte.";

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function analyticsId(value: string) {
  return value.toUpperCase().match(/\bG-[A-Z0-9]{4,20}\b/)?.[0] || "";
}

function adsenseClientId(value: string) {
  return value.toLowerCase().match(/\bca-pub-\d{10,30}\b/)?.[0] || "";
}

function adsenseSlotId(value: string) {
  return value.match(/data-ad-slot=["'](\d{5,30})["']/i)?.[1] || value.match(/^\d{5,30}$/)?.[0] || "";
}

async function authorized(request: Request) {
  return Boolean(await getAdminFromRequest(request));
}

export async function GET(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const settings = await readPortalSettings();
  const measurementId = typeof settings.google_analytics_id === "string" ? settings.google_analytics_id : "";
  const adsenseClient = typeof settings.adsense_client_id === "string" ? settings.adsense_client_id : "";
  const adsenseSlot = typeof settings.adsense_slot_id === "string" ? settings.adsense_slot_id : "";
  return NextResponse.json({
    analyticsConfigured: Boolean(measurementId),
    analyticsHint: measurementId ? `${measurementId.slice(0, 4)}••••${measurementId.slice(-3)}` : null,
    adsenseConfigured: Boolean(adsenseClient && adsenseSlot),
    adsenseEnabled: settings.adsense_enabled !== false && Boolean(adsenseClient && adsenseSlot),
    adsenseHint: adsenseClient ? `${adsenseClient.slice(0, 10)}••••${adsenseClient.slice(-4)}` : null,
    adsenseSlotHint: adsenseSlot ? `••••${adsenseSlot.slice(-4)}` : null,
    siteTitle: typeof settings.seo_site_title === "string" ? settings.seo_site_title : DEFAULT_TITLE,
    description: typeof settings.seo_description === "string" ? settings.seo_description : DEFAULT_DESCRIPTION,
    keywords: typeof settings.seo_keywords === "string" ? settings.seo_keywords : "classificados, anúncios, Belo Horizonte, imóveis, veículos, empregos, serviços",
    googleVerification: typeof settings.google_site_verification === "string" ? settings.google_site_verification : "",
    schemaEnabled: settings.seo_schema_enabled !== false,
    sitemapUrl: `${SITE_URL}/sitemap.xml`,
    robotsUrl: `${SITE_URL}/robots.txt`,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const current = await readPortalSettings();
  const submittedAnalytics = clean(body.analyticsCode, 10_000);
  const measurementId = submittedAnalytics ? analyticsId(submittedAnalytics) : typeof current.google_analytics_id === "string" ? current.google_analytics_id : "";
  if (submittedAnalytics && !measurementId) return NextResponse.json({ error: "O código informado não contém um ID válido do Google Analytics no formato G-XXXXXXXXXX." }, { status: 400 });
  const submittedAdsense = clean(body.adsenseCode, 20_000);
  const submittedSlot = clean(body.adsenseSlot, 200);
  const adsenseClient = submittedAdsense ? adsenseClientId(submittedAdsense) : typeof current.adsense_client_id === "string" ? current.adsense_client_id : "";
  const adsenseSlot = submittedSlot ? adsenseSlotId(submittedSlot) : submittedAdsense ? adsenseSlotId(submittedAdsense) : typeof current.adsense_slot_id === "string" ? current.adsense_slot_id : "";
  if (submittedAdsense && !adsenseClient) return NextResponse.json({ error: "O código informado não contém um identificador AdSense válido no formato ca-pub-XXXXXXXXXX." }, { status: 400 });
  if (submittedSlot && !adsenseSlot) return NextResponse.json({ error: "O ID do bloco de anúncio deve conter somente números." }, { status: 400 });
  const adsenseEnabled = body.adsenseEnabled !== false && Boolean(adsenseClient && adsenseSlot);
  if (body.adsenseEnabled !== false && (submittedAdsense || submittedSlot) && (!adsenseClient || !adsenseSlot)) return NextResponse.json({ error: "Para ativar o AdSense, informe o código da conta e o ID numérico do bloco de anúncio responsivo." }, { status: 400 });
  const siteTitle = clean(body.siteTitle, 80) || DEFAULT_TITLE;
  const description = clean(body.description, 180) || DEFAULT_DESCRIPTION;
  const keywords = clean(body.keywords, 500);
  const googleVerification = clean(body.googleVerification, 200).replace(/[<>"']/g, "");
  await writePortalSettings({
    google_analytics_id: measurementId,
    adsense_client_id: adsenseClient,
    adsense_slot_id: adsenseSlot,
    adsense_enabled: adsenseEnabled,
    seo_site_title: siteTitle,
    seo_description: description,
    seo_keywords: keywords,
    google_site_verification: googleVerification,
    seo_schema_enabled: body.schemaEnabled !== false,
  });
  return NextResponse.json({ ok: true, analyticsConfigured: Boolean(measurementId), analyticsHint: measurementId ? `${measurementId.slice(0, 4)}••••${measurementId.slice(-3)}` : null, adsenseConfigured: Boolean(adsenseClient && adsenseSlot), adsenseEnabled, adsenseHint: adsenseClient ? `${adsenseClient.slice(0, 10)}••••${adsenseClient.slice(-4)}` : null, adsenseSlotHint: adsenseSlot ? `••••${adsenseSlot.slice(-4)}` : null });
}

export async function DELETE(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  await writePortalSettings({ google_analytics_id: "" });
  return NextResponse.json({ ok: true });
}

export async function PUT(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  await writePortalSettings({ adsense_client_id: "", adsense_slot_id: "", adsense_enabled: false });
  return NextResponse.json({ ok: true });
}

export const dynamic = "force-dynamic";
