import { NextResponse } from "next/server";
import { getAdminFromRequest } from "../../../../../db/admin-auth";
import { listLegalPublications, upsertWordpressLegalPublications } from "../../../../../db/legal-publications";
import { writePortalSettings } from "../../../../../db/settings";
import { normalizeWordpressLegalPayload, safePublicHttpUrl, wordpressLegalEndpoint } from "../../../../../lib/legal-wordpress";

const MAX_JSON_SIZE = 8 * 1024 * 1024;

export async function POST(request: Request) {
  if (!(await getAdminFromRequest(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const payload = await request.json().catch(() => ({})) as { sourceUrl?: string };
  const sourceUrl = payload.sourceUrl?.trim() || "";
  if (!sourceUrl || !safePublicHttpUrl(sourceUrl)) {
    return NextResponse.json({ error: "Informe uma URL pública válida do WordPress." }, { status: 400 });
  }

  let endpoint: URL;
  try {
    endpoint = wordpressLegalEndpoint(sourceUrl);
  } catch {
    return NextResponse.json({ error: "Não foi possível formar o endpoint da API do WordPress." }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      signal: controller.signal,
      headers: { accept: "application/json", "user-agent": "Portal-Balcao-Legal-Importer/1.0" },
    });
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "A API do WordPress excedeu o tempo limite."
      : "Não foi possível acessar a API do WordPress.";
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) return NextResponse.json({ error: `A API do WordPress respondeu com HTTP ${response.status}.` }, { status: 502 });
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > MAX_JSON_SIZE) return NextResponse.json({ error: "O JSON do WordPress excede 8 MB." }, { status: 413 });
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_SIZE) return NextResponse.json({ error: "O JSON do WordPress excede 8 MB." }, { status: 413 });
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "A URL informada não retornou um JSON válido." }, { status: 502 });
  }

  const normalized = await normalizeWordpressLegalPayload(json, endpoint);
  const publications = [...new Map(normalized.map((item) => [item.id, item])).values()];
  if (!publications.length) {
    return NextResponse.json({ error: "Nenhum edital com arquivo PDF foi localizado nesse JSON." }, { status: 422 });
  }
  const result = await upsertWordpressLegalPublications(publications);
  await writePortalSettings({ legal_wordpress_api_url: sourceUrl });
  const stored = await listLegalPublications({ includeInactive: true, limit: 250 });
  return NextResponse.json({
    ok: true,
    sourceUrl,
    endpoint: endpoint.toString(),
    detected: publications.length,
    imported: result.imported,
    updated: result.updated,
    publications: stored.items,
  }, { headers: { "Cache-Control": "no-store" } });
}
