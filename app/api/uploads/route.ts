import { NextResponse } from "next/server";
import { getAdminFromRequest } from "../../../db/admin-auth";

export async function POST(request: Request) {
  if (!(await getAdminFromRequest(request))) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }
  const { env } = await import("cloudflare:workers");
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.type.startsWith("image/")) return NextResponse.json({ error: "Envie uma imagem válida." }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "A imagem deve ter no máximo 5 MB." }, { status: 400 });
  let bytes = await file.arrayBuffer(); let contentType = file.type; let extension = file.type.split("/")[1]?.replace("jpeg", "jpg") || "webp";
  const images = (env as unknown as { IMAGES?: { input(stream: ReadableStream): { transform(options: Record<string, unknown>): { output(options: { format: string; quality: number }): Promise<{ response(): Response }> } } } }).IMAGES;
  if (images) {
    try {
      const transformed = await images.input(new Blob([bytes]).stream()).transform({ width: 1920, fit: "scale-down" }).output({ format: "image/webp", quality: 82 });
      const response = transformed.response();
      if (response.ok) { bytes = await response.arrayBuffer(); contentType = "image/webp"; extension = "webp"; }
    } catch { /* Mantém o arquivo validado como compatibilidade. */ }
  }
  const key = `discover-${crypto.randomUUID()}.${extension}`;
  await env.BUCKET.put(key, bytes, { httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" } });
  return NextResponse.json({ url: `/api/media/${encodeURIComponent(key)}` });
}
