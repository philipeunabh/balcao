import { NextResponse } from "next/server";
import { getAdminFromRequest } from "../../../../../../db/admin-auth";
import { moderateListing } from "../../../../../../db/listings";
import { invalidatePublicListingsCache } from "../../../../../../db/public-listings";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(request);
  if (!admin) return NextResponse.json({ error: "Acesso administrativo necessário." }, { status: 401 });
  const { id } = await context.params;
  const payload = await request.json().catch(() => ({})) as { action?: unknown };
  if (payload.action !== "approve" && payload.action !== "reject") {
    return NextResponse.json({ error: "Ação de moderação inválida." }, { status: 400 });
  }
  const result = await moderateListing(id, payload.action);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 });
  invalidatePublicListingsCache();
  return NextResponse.json({
    ok: true,
    id: result.id,
    status: result.status,
    message: result.status === "active" ? "Anúncio aprovado e publicado." : "Anúncio rejeitado.",
  });
}
