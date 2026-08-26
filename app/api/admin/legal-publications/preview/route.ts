import { NextResponse } from "next/server";
import { getAdminFromRequest } from "../../../../../db/admin-auth";
import { getLegalPublication, setLegalPublicationPreview } from "../../../../../db/legal-publications";

const ACCEPTED_TYPES = new Map([
  ["image/webp", "webp"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
]);

export async function POST(request: Request) {
  if (!(await getAdminFromRequest(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const form = await request.formData();
  const id = String(form.get("id") || "").trim();
  const pageIndex = Number(form.get("pageIndex"));
  const file = form.get("file");
  if (!id || !(await getLegalPublication(id))) return NextResponse.json({ error: "Publicação legal não encontrada." }, { status: 404 });
  if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex > 11) {
    return NextResponse.json({ error: "A página da prévia é inválida." }, { status: 400 });
  }
  if (!(file instanceof File) || !ACCEPTED_TYPES.has(file.type) || !file.size || file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "Envie uma imagem de prévia válida com até 5 MB." }, { status: 400 });
  }
  const bytes = await file.arrayBuffer();
  const extension = ACCEPTED_TYPES.get(file.type) || "webp";
  const key = `legal-${id}-page-${pageIndex + 1}-${crypto.randomUUID()}.${extension}`;
  const { env } = await import("cloudflare:workers");
  await env.BUCKET.put(key, bytes, {
    httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" },
  });
  const publication = await setLegalPublicationPreview(id, pageIndex, `/api/media/${encodeURIComponent(key)}`);
  return NextResponse.json({ publication }, { headers: { "Cache-Control": "no-store" } });
}
