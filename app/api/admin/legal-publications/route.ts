import { NextResponse } from "next/server";
import { getAdminFromRequest } from "../../../../db/admin-auth";
import { createManualLegalPublication, listLegalPublications } from "../../../../db/legal-publications";
import { readPortalSettings } from "../../../../db/settings";

const DEFAULT_SOURCE = "https://jornalbalcao.com.br/publicidadelegal";
const MAX_PDF_SIZE = 25 * 1024 * 1024;

function cleanFilename(value: string) {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const cleaned = normalized.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return (cleaned || "edital.pdf").slice(-180);
}

function validIsoDate(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

async function authorized(request: Request) {
  return Boolean(await getAdminFromRequest(request));
}

export async function GET(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const [result, settings] = await Promise.all([
    listLegalPublications({ includeInactive: true, limit: 250 }),
    readPortalSettings(),
  ]);
  return NextResponse.json({
    publications: result.items,
    total: result.total,
    sourceUrl: typeof settings.legal_wordpress_api_url === "string" && settings.legal_wordpress_api_url
      ? settings.legal_wordpress_api_url
      : DEFAULT_SOURCE,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const form = await request.formData();
  const title = String(form.get("title") || "").trim();
  const body = String(form.get("body") || "").trim();
  const publishedAtInput = String(form.get("publishedAt") || "").trim();
  const file = form.get("file");
  if (title.length < 3 || title.length > 220) return NextResponse.json({ error: "Informe um nome entre 3 e 220 caracteres." }, { status: 400 });
  if (body.length > 20_000) return NextResponse.json({ error: "O texto deve ter no máximo 20.000 caracteres." }, { status: 400 });
  if (!(file instanceof File) || !/\.pdf$/i.test(file.name) || (file.type && file.type !== "application/pdf")) {
    return NextResponse.json({ error: "Envie um arquivo PDF válido." }, { status: 400 });
  }
  if (!file.size || file.size > MAX_PDF_SIZE) return NextResponse.json({ error: "O PDF deve ter no máximo 25 MB." }, { status: 400 });
  const bytes = await file.arrayBuffer();
  const signature = new TextDecoder("ascii").decode(bytes.slice(0, 5));
  if (signature !== "%PDF-") return NextResponse.json({ error: "O arquivo enviado não possui uma estrutura PDF válida." }, { status: 400 });
  const publishedAt = publishedAtInput ? validIsoDate(publishedAtInput) : new Date().toISOString();
  if (!publishedAt) return NextResponse.json({ error: "Informe uma data de publicação válida." }, { status: 400 });

  const { env } = await import("cloudflare:workers");
  const filename = cleanFilename(file.name);
  const key = `legal-${crypto.randomUUID()}-${filename}`;
  await env.BUCKET.put(key, bytes, {
    httpMetadata: { contentType: "application/pdf", cacheControl: "public, max-age=31536000, immutable" },
    customMetadata: { originalFilename: file.name.slice(0, 240) },
  });
  const publication = await createManualLegalPublication({
    title,
    body,
    filename: file.name.slice(0, 240),
    pdfKey: key,
    pdfUrl: `/api/media/${encodeURIComponent(key)}`,
    publishedAt,
  });
  return NextResponse.json({ publication }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
