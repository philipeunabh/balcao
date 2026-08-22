import { NextResponse } from "next/server";
import { getAdminFromRequest } from "../../../../../db/admin-auth";
import { adminDeleteListing, adminFeatureListing, adminUpdateListing } from "../../../../../db/listings";

async function authorized(request: Request) { return Boolean(await getAdminFromRequest(request)); }

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const { id } = await params; const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  const listing = await adminUpdateListing(id, {
    title: String(payload.title || ""), description: String(payload.description || ""), category: String(payload.category || "Outros"),
    subcategory: String(payload.subcategory || "Outros"), negotiationType: String(payload.negotiationType || "Venda"), address: String(payload.address || ""),
    priceCents: payload.priceCents == null ? null : Math.max(0, Math.round(Number(payload.priceCents))), status: typeof payload.status === "string" ? payload.status : undefined,
    images: Array.isArray(payload.images) ? payload.images.filter((item): item is string => typeof item === "string") : undefined,
  });
  return listing ? NextResponse.json({ ok: true, listing }) : NextResponse.json({ error: "Anúncio não encontrado." }, { status: 404 });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const { id } = await params; return await adminDeleteListing(id) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Anúncio não encontrado." }, { status: 404 });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const { id } = await params; const payload = await request.json().catch(() => ({})) as { action?: string };
  if (payload.action !== "feature" && payload.action !== "super") return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  const listing = await adminFeatureListing(id, payload.action === "super");
  return listing ? NextResponse.json({ ok: true, listing }) : NextResponse.json({ error: "Anúncio não encontrado." }, { status: 404 });
}
