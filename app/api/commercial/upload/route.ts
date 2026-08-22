import { NextResponse } from "next/server";
import { getCommercialFromRequest } from "../../../../db/admin-auth";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export async function POST(request: Request) {
  const commercial = await getCommercialFromRequest(request);
  if (!commercial) return NextResponse.json({ error: "Acesso comercial necessário." }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !allowedTypes.has(file.type)) return NextResponse.json({ error: "Envie uma imagem JPG, PNG, WebP ou AVIF." }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "Cada imagem deve ter no máximo 5 MB." }, { status: 413 });
  const { env } = await import("cloudflare:workers");
  let bytes = await file.arrayBuffer();
  let contentType = file.type;
  let extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
  const images = (env as unknown as { IMAGES?: { input(stream: ReadableStream): { transform(options: Record<string, unknown>): { output(options: { format: string; quality: number }): Promise<{ response(): Response }> } } } }).IMAGES;
  if (images) {
    try {
      const transformed = await images.input(new Blob([bytes]).stream()).transform({ width: 1920, fit: "scale-down" }).output({ format: "image/webp", quality: 82 });
      const response = transformed.response();
      if (response.ok) { bytes = await response.arrayBuffer(); contentType = "image/webp"; extension = "webp"; }
    } catch { /* Mantém a imagem validada quando a transformação não estiver disponível. */ }
  }
  const key = `listing-commercial/${commercial.id}/${crypto.randomUUID()}.${extension}`;
  await env.BUCKET.put(key, bytes, {
    httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" },
    customMetadata: { staffId: String(commercial.id), originalName: file.name.slice(0, 180) },
  });
  return NextResponse.json({ url: `/api/media/${encodeURIComponent(key)}` });
}
