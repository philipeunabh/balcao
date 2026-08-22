import { NextResponse } from "next/server";
import { getAdminFromRequest } from "../../../../db/admin-auth";
import { getListingImport, processListingImportBatch, startListingImport, synchronizeImportedListings } from "../../../../db/listing-import";
import { readPortalSettings } from "../../../../db/settings";
import { portalCategories } from "../../../categories";

function configuredCategories(settings: Record<string, unknown>) {
  if (!Array.isArray(settings.categories)) return portalCategories;
  const parsed = settings.categories.flatMap((item) => item && typeof item === "object" && typeof (item as { name?: unknown }).name === "string" && Array.isArray((item as { subs?: unknown }).subs) ? [{ name: (item as { name: string }).name, subs: (item as { subs: unknown[] }).subs.filter((value): value is string => typeof value === "string") }] : []);
  return parsed.length ? parsed : portalCategories;
}
async function authorized(request: Request) { return Boolean(await getAdminFromRequest(request)); }

export async function GET(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const settings = await readPortalSettings(); const id = new URL(request.url).searchParams.get("id") || undefined;
  return NextResponse.json({ ...(await getListingImport(id)), sourceUrl: typeof settings.listing_import_url === "string" ? settings.listing_import_url : "" }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const payload = await request.json().catch(() => ({})) as { action?: string; sourceUrl?: string; jobId?: string };
  try {
    if (payload.action === "start" && payload.sourceUrl) return NextResponse.json(await startListingImport(payload.sourceUrl));
    if (payload.action === "process" && payload.jobId) return NextResponse.json(await processListingImportBatch(payload.jobId, configuredCategories(await readPortalSettings())));
    if (payload.action === "synchronize") return NextResponse.json(await synchronizeImportedListings(configuredCategories(await readPortalSettings())));
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Falha na importação." }, { status: 400 }); }
}
