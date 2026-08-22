import { NextResponse } from "next/server";
import { getAdminFromRequest } from "../../../../db/admin-auth";
import { getAiReviewJob, processNextAiReviewItem, startAiReviewJob } from "../../../../db/ai-review";
import { readPortalSettings } from "../../../../db/settings";
import { portalCategories } from "../../../categories";

async function authorized(request: Request) { return Boolean(await getAdminFromRequest(request)); }
function configuredCategories(settings: Record<string, unknown>) {
  if (!Array.isArray(settings.categories)) return portalCategories;
  const parsed = settings.categories.flatMap((item) => item && typeof item === "object" && typeof (item as { name?: unknown }).name === "string" && Array.isArray((item as { subs?: unknown }).subs) ? [{ name: (item as { name: string }).name, subs: (item as { subs: unknown[] }).subs.filter((value): value is string => typeof value === "string") }] : []);
  return parsed.length ? parsed : portalCategories;
}

export async function GET(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") || undefined;
  return NextResponse.json(await getAiReviewJob(id), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const payload = await request.json().catch(() => ({})) as { action?: string; jobId?: string };
  if (payload.action === "start") return NextResponse.json(await startAiReviewJob());
  if (payload.action === "process" && payload.jobId) {
    const settings = await readPortalSettings();
    return NextResponse.json(await processNextAiReviewItem(payload.jobId, configuredCategories(settings)));
  }
  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
}
