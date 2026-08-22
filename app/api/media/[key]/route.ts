type ImageBinding = {
  input(stream: ReadableStream): {
    transform(options: Record<string, unknown>): {
      output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
    };
  };
};

export async function GET(request: Request, context: { params: Promise<{ key: string }> }) {
  const { env } = await import("cloudflare:workers");
  const { key } = await context.params;
  const decodedKey = decodeURIComponent(key);
  let object = await env.BUCKET.get(decodedKey);
  if (!object) return new Response("Imagem não encontrada.", { status: 404 });
  const url = new URL(request.url);
  const requestedFormat = url.searchParams.get("format");
  const widthValue = Number(url.searchParams.get("w") || 0);
  const width = Number.isFinite(widthValue) && widthValue > 0 ? Math.min(Math.max(Math.round(widthValue), 160), 1920) : undefined;
  const format = requestedFormat === "avif" ? "image/avif" : requestedFormat === "webp" ? "image/webp" : null;
  const images = (env as unknown as { IMAGES?: ImageBinding }).IMAGES;

  if (images && format && object.body) {
    try {
      const transformed = await images.input(object.body)
        .transform(width ? { width, fit: "scale-down" } : {})
        .output({ format, quality: requestedFormat === "avif" ? 68 : 78 });
      const response = transformed.response();
      const headers = new Headers(response.headers);
      headers.set("cache-control", "public, max-age=31536000, immutable");
      headers.set("content-type", format);
      headers.set("vary", "Accept");
      return new Response(response.body, { status: response.status, headers });
    } catch {
      object = await env.BUCKET.get(decodedKey);
      if (!object) return new Response("Imagem não encontrada.", { status: 404 });
    }
  }
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("vary", "Accept");
  return new Response(object.body, { headers });
}
