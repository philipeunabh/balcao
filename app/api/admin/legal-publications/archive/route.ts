import { NextResponse } from "next/server";
import { getAdminFromRequest } from "../../../../../db/admin-auth";
import { getLegalPublication, markLegalPublicationArchived } from "../../../../../db/legal-publications";
import { safePublicHttpUrl } from "../../../../../lib/legal-wordpress";

const MAX_PDF_SIZE = 25 * 1024 * 1024;

function cleanFilename(value: string) {
  const cleaned = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return (cleaned || "edital.pdf").slice(-180);
}

export async function POST(request: Request) {
  if (!(await getAdminFromRequest(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const payload = await request.json().catch(() => ({})) as { id?: string };
  const id = payload.id?.trim() || "";
  const publication = id ? await getLegalPublication(id) : null;
  if (!publication) return NextResponse.json({ error: "Publicação legal não encontrada." }, { status: 404 });
  if (publication.pdfKey) return NextResponse.json({ publication }, { headers: { "Cache-Control": "no-store" } });
  const remoteUrl = publication.originalPdfUrl;
  if (!remoteUrl || !safePublicHttpUrl(remoteUrl) || !/\.pdf(?:$|[?#])/i.test(remoteUrl)) {
    return NextResponse.json({ error: "O endereço original do PDF não é válido." }, { status: 422 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  let response: Response;
  try {
    response = await fetch(remoteUrl, {
      signal: controller.signal,
      headers: { accept: "application/pdf", "user-agent": "Portal-Balcao-Legal-Importer/1.0" },
    });
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "O download do PDF excedeu o tempo limite."
      : "Não foi possível baixar o PDF original.";
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) return NextResponse.json({ error: `O PDF original respondeu com HTTP ${response.status}.` }, { status: 502 });
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > MAX_PDF_SIZE) return NextResponse.json({ error: "O PDF original excede 25 MB." }, { status: 413 });
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > MAX_PDF_SIZE) return NextResponse.json({ error: "O PDF original excede 25 MB." }, { status: 413 });
  if (new TextDecoder("ascii").decode(bytes.slice(0, 5)) !== "%PDF-") {
    return NextResponse.json({ error: "O arquivo remoto não possui uma estrutura PDF válida." }, { status: 422 });
  }

  const { env } = await import("cloudflare:workers");
  const key = `legal-${publication.id}-${crypto.randomUUID()}-${cleanFilename(publication.filename)}`;
  await env.BUCKET.put(key, bytes, {
    httpMetadata: { contentType: "application/pdf", cacheControl: "public, max-age=31536000, immutable" },
    customMetadata: { originalUrl: remoteUrl.slice(0, 1024), originalFilename: publication.filename.slice(0, 240) },
  });
  const archived = await markLegalPublicationArchived(publication.id, key, `/api/media/${encodeURIComponent(key)}`);
  return NextResponse.json({ publication: archived }, { headers: { "Cache-Control": "no-store" } });
}
