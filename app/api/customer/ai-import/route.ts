import { NextResponse } from "next/server";
import { portalCategories } from "../../../categories";
import { getCustomerBySessionToken, readCustomerCookie } from "../../../../db/customer-auth";
import { getVirtualStoreByUser } from "../../../../db/stores";
import { extractListingUrlWithOpenAI, type AiImportedListingDraft } from "../../../../db/openai";
import { listStoreAiDrafts, listUserAiDrafts, saveStoreAiImport, saveUserAiImport, type AiImportSaveMode, type AiImportScope } from "../../../../db/ai-importer";

type UnknownRecord = Record<string, unknown>;

function safePublicUrl(raw: string) {
  try {
    const url = new URL(raw.trim());
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (host === "localhost" || host === "0.0.0.0" || host === "::1" || host.endsWith(".local") || host.endsWith(".internal") ||
      /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)) return null;
    url.hash = "";
    return url;
  } catch { return null; }
}

function decodeEntities(value: string) {
  return value.replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&nbsp;/gi, " ");
}

function absoluteImage(raw: string, base: URL) {
  try {
    const cleaned = decodeEntities(raw.trim()).replace(/^['"]|['"]$/g, "");
    const url = new URL(cleaned, base);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (/\.(svg|ico)(?:$|\?)/i.test(url.toString())) return null;
    return url.toString();
  } catch { return null; }
}

function extractPage(html: string, sourceUrl: URL) {
  const imageValues: string[] = [];
  const patterns = [
    /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/gi,
    /<img[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["']/gi,
    /"(?:image|imageUrl|thumbnailUrl|contentUrl)"\s*:\s*"(https?:\\?\/\\?\/[^"\\]+(?:\\.[^"\\]+)*)"/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html)) && imageValues.length < 100) imageValues.push(match[1].replace(/\\\//g, "/"));
  }
  const images = [...new Set(imageValues.map((item) => absoluteImage(item, sourceUrl)).filter((item): item is string => Boolean(item)))].slice(0, 40);
  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, " ") || "");
  const description = decodeEntities(html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] || "");
  const structured = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((item) => item[1]).join("\n").slice(0, 30000);
  const visible = decodeEntities(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  return { images, pageText: `Título HTML: ${title}\nDescrição: ${description}\nDados estruturados: ${structured}\nTexto visível: ${visible}`.slice(0, 70000) };
}

async function readPublicPage(url: URL) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { redirect: "follow", signal: controller.signal, headers: {
      accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5",
      "user-agent": "JornalBalcao-ImportadorIA/1.0",
    } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const length = Number(response.headers.get("content-length") || 0);
    if (length > 2_500_000) throw new Error("Página maior que 2,5 MB");
    const content = await response.text();
    if (content.length > 2_500_000) throw new Error("Página maior que 2,5 MB");
    const finalUrl = safePublicUrl(response.url) || url;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("json")) return { images: [] as string[], pageText: `JSON da página:\n${content.slice(0, 70000)}`, finalUrl };
    return { ...extractPage(content, finalUrl), finalUrl };
  } finally { clearTimeout(timeout); }
}

function parseDraft(value: unknown): AiImportedListingDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as UnknownRecord;
  const category = String(item.category || "").trim();
  const subcategory = String(item.subcategory || "").trim();
  const parent = portalCategories.find((record) => record.name === category);
  const sourceUrl = safePublicUrl(String(item.sourceUrl || ""));
  const externalUrl = safePublicUrl(String(item.externalUrl || item.sourceUrl || ""));
  const title = String(item.title || "").trim().slice(0, 120);
  const description = String(item.description || "").trim().slice(0, 5000);
  if (!parent?.subs.includes(subcategory) || !sourceUrl || !externalUrl || title.length < 5 || description.length < 20) return null;
  const price = item.priceCents == null || item.priceCents === "" ? null : Number(item.priceCents);
  if (price != null && (!Number.isInteger(price) || price < 0)) return null;
  const negotiationType = ["Venda", "Aluguel", "Troca", "Compra", "Temporada", "Serviço", "Outra"].includes(String(item.negotiationType)) ? String(item.negotiationType) : "Venda";
  const images = Array.isArray(item.images) ? item.images.map(String).filter((url) => safePublicUrl(url)).slice(0, 12) : [];
  return {
    sourceUrl: sourceUrl.toString(), externalUrl: externalUrl.toString(), title, description, priceCents: price,
    category, subcategory, negotiationType, address: String(item.address || "").trim().slice(0, 240), images,
    features: Array.isArray(item.features) ? item.features.map(String).map((text) => text.trim()).filter(Boolean).slice(0, 16) : [],
    confidence: Math.max(0, Math.min(100, Number(item.confidence || 0))),
  };
}

export async function POST(request: Request) {
  const customer = await getCustomerBySessionToken(readCustomerCookie(request));
  if (!customer) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as UnknownRecord;
  const rawUrls = Array.isArray(body.urls) ? body.urls.map(String) : String(body.urls || "").split(/[\n,]+/);
  const urls = [...new Set(rawUrls.map((item) => safePublicUrl(item)?.toString()).filter((item): item is string => Boolean(item)))].slice(0, 10);
  if (!urls.length) return NextResponse.json({ error: "Informe pelo menos uma URL pública válida." }, { status: 400 });
  const drafts: AiImportedListingDraft[] = [];
  const failures: Array<{ url: string; error: string }> = [];
  for (const rawUrl of urls) {
    try {
      const source = await readPublicPage(new URL(rawUrl));
      drafts.push(await extractListingUrlWithOpenAI({ sourceUrl: source.finalUrl.toString(), pageText: source.pageText, imageCandidates: source.images, categories: portalCategories }));
    } catch (error) {
      const message = error instanceof Error && error.name === "AbortError" ? "Tempo limite ao acessar a página." : error instanceof Error ? error.message : "Falha ao processar a página.";
      failures.push({ url: rawUrl, error: message });
    }
  }
  if (!drafts.length) return NextResponse.json({ error: "Nenhum anúncio pôde ser gerado.", failures }, { status: 400 });
  return NextResponse.json({ drafts, failures, message: `${drafts.length} rascunho(s) gerado(s) para revisão.` });
}

export async function PUT(request: Request) {
  const customer = await getCustomerBySessionToken(readCustomerCookie(request));
  if (!customer) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as UnknownRecord;
  const scope: AiImportScope = body.scope === "store" ? "store" : "user";
  const mode: AiImportSaveMode = body.mode === "publish" ? "publish" : "draft";
  const records = Array.isArray(body.drafts) ? body.drafts.map(parseDraft).filter((item): item is AiImportedListingDraft => Boolean(item)).slice(0, 10) : [];
  if (!records.length) return NextResponse.json({ error: "Nenhum rascunho válido foi enviado." }, { status: 400 });
  const store = scope === "store" ? await getVirtualStoreByUser(customer.id) : null;
  if (scope === "store" && !store) return NextResponse.json({ error: "A loja virtual precisa estar habilitada para importar anúncios." }, { status: 403 });
  const saved: Array<{ id: string; status: string; title: string }> = [];
  const failures: Array<{ title: string; error: string }> = [];
  for (const draft of records) {
    const result = store ? await saveStoreAiImport(store, draft, mode) : await saveUserAiImport(customer, draft, mode);
    if ("error" in result) failures.push({ title: draft.title, error: String(result.error || "Não foi possível salvar o anúncio.") });
    else saved.push({ ...result, title: draft.title });
  }
  if (!saved.length) return NextResponse.json({ error: failures[0]?.error || "Não foi possível salvar os anúncios.", failures }, { status: 409 });
  return NextResponse.json({ saved, failures, message: mode === "draft" ? `${saved.length} anúncio(s) salvo(s) como rascunho.` : `${saved.length} anúncio(s) enviado(s) para publicação.` });
}

export async function GET(request: Request) {
  const customer = await getCustomerBySessionToken(readCustomerCookie(request));
  if (!customer) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const scope: AiImportScope = new URL(request.url).searchParams.get("scope") === "store" ? "store" : "user";
  if (scope === "store") {
    const store = await getVirtualStoreByUser(customer.id);
    if (!store) return NextResponse.json({ drafts: [] });
    return NextResponse.json({ drafts: await listStoreAiDrafts(store.id) });
  }
  return NextResponse.json({ drafts: await listUserAiDrafts(customer.id) });
}

export const dynamic = "force-dynamic";
