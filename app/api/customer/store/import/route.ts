import { NextResponse } from "next/server";
import { getCustomerBySessionToken, readCustomerCookie } from "../../../../../db/customer-auth";
import { getVirtualStoreByUser, replaceIntegratedListings, type ImportedStoreListing, type VirtualStoreRecord } from "../../../../../db/stores";
import { extractStoreCatalogWithOpenAI } from "../../../../../db/openai";

type UnknownRecord = Record<string, unknown>;

function value(source: UnknownRecord, keys: string[]) {
  for (const key of keys) if (source[key] != null && source[key] !== "") return source[key];
  return undefined;
}

function asText(input: unknown) { if(input&&typeof input==="object"&&"rendered" in input)return String((input as {rendered?:unknown}).rendered||"").replace(/<[^>]+>/g," ").trim(); return input == null ? "" : String(input).trim(); }

function priceCents(input: unknown) {
  if (typeof input === "number" && Number.isFinite(input)) return Math.round(input * 100);
  const raw = asText(input).replace(/[^\d,.-]/g, "");
  if (!raw) return null;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

function normalizeRecord(source: UnknownRecord, store: VirtualStoreRecord, index: number): ImportedStoreListing | null {
  const title = asText(value(source, ["title", "titulo", "name", "nome", "modelo"]));
  if (!title) return null;
  const rawImages = value(source, ["images", "imagens", "photos", "fotos"]);
  const images = [value(source, ["image", "imagem", "photo", "foto", "cover", "capa"]), ...(Array.isArray(rawImages) ? rawImages : [])]
    .map((item) => typeof item === "object" && item ? asText(value(item as UnknownRecord, ["url", "src", "image", "imagem"])) : asText(item))
    .filter((item) => /^https?:\/\//i.test(item));
  const category = asText(value(source, ["category", "categoria"])) || (store.type === "real_estate" ? "Imóveis" : store.type === "vehicle" ? "Veículos" : "Outros");
  const subcategory = asText(value(source, ["subcategory", "subcategoria", "tipo"])) || (store.type === "vehicle" ? "Carros, vans e utilitários" : "Outros");
  const externalUrl = safeRemoteUrl(asText(value(source, ["external_url", "purchase_url", "product_url", "link_compra", "link", "url", "site_url"])))?.toString() || null;
  const known = new Set(["title", "titulo", "name", "nome", "description", "descricao", "price", "preco", "valor", "address", "endereco", "image", "imagem", "photo", "foto", "images", "imagens", "photos", "fotos", "category", "categoria", "subcategory", "subcategoria", "external_url", "purchase_url", "product_url", "link_compra", "link", "url", "site_url"]);
  const attributes = Object.fromEntries(Object.entries(source).filter(([key, item]) => !known.has(key) && ["string", "number", "boolean"].includes(typeof item)).slice(0, 24)) as Record<string, string | number | boolean>;
  const fallback = store.logoUrl || "/logo-balcao.webp";
  return {
    title: title.slice(0, 180), description: (asText(value(source, ["description", "descricao", "details", "detalhes"])) || `Anúncio importado para ${store.name}.`).slice(0, 4000),
    category: category.slice(0, 80), subcategory: subcategory.slice(0, 100), priceCents: priceCents(value(source, ["price", "preco", "valor"])),
    address: (asText(value(source, ["address", "endereco", "location", "localizacao"])) || `${store.city} - ${store.state}`).slice(0, 240),
    coverImage: images[0] || fallback, images: images.length ? images.slice(0, 12) : [fallback], externalUrl,
    attributes: { ...attributes, importado: true, ordem: index + 1 },
  };
}

function decodeXml(value: string) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

function parseXml(content: string) {
  const records: UnknownRecord[] = [];
  const blockPattern = /<(item|anuncio|listing|produto)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let block: RegExpExecArray | null;
  while ((block = blockPattern.exec(content)) && records.length < 2000) {
    const record: UnknownRecord = {};
    const tagPattern = /<([a-zA-Z0-9_:-]+)\b[^>]*>([\s\S]*?)<\/\1>/g;
    let tag: RegExpExecArray | null;
    while ((tag = tagPattern.exec(block[2]))) {
      const key = tag[1].toLowerCase().replace(/^.*:/, "");
      const text = decodeXml(tag[2].replace(/<[^>]+>/g, " "));
      if (text && record[key] == null) record[key] = text;
    }
    if (Object.keys(record).length) records.push(record);
  }
  return records;
}

function parsePayload(content: string, format: "xml" | "json") {
  if (format === "xml") return parseXml(content);
  const parsed = JSON.parse(content) as unknown;
  if (Array.isArray(parsed)) return parsed.filter((item): item is UnknownRecord => typeof item === "object" && item !== null);
  if (typeof parsed === "object" && parsed) {
    const root = parsed as UnknownRecord;
    const list = value(root, ["listings", "anuncios", "items", "produtos", "data"]);
    if (Array.isArray(list)) return list.filter((item): item is UnknownRecord => typeof item === "object" && item !== null);
  }
  return [];
}

function safeRemoteUrl(raw: string) {
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || host === "::1" || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return null;
    return url;
  } catch { return null; }
}

export async function POST(request: Request) {
  const customer = await getCustomerBySessionToken(readCustomerCookie(request));
  if (!customer) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const store = await getVirtualStoreByUser(customer.id);
  if (!store) return NextResponse.json({ error: "Salve a configuração da loja antes de importar anúncios." }, { status: 400 });
  const now=Date.now(); if(!store.active||(store.planStartedAt&&Date.parse(store.planStartedAt)>now)||(store.planEndsAt&&Date.parse(store.planEndsAt)<now)) return NextResponse.json({error:"O plano da loja está inativo ou expirado."},{status:403});
  try {
    let content = "";
    let format: "xml" | "json" = store.integrationType === "xml" ? "xml" : "json";
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData();
      const value = form.get("file");
      if (!value || typeof value === "string" || typeof value.text !== "function") return NextResponse.json({ error: "Selecione um arquivo XML ou JSON." }, { status: 400 });
      const file = value as File;
      if (file.size <= 0 || file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "O arquivo deve ter no máximo 5 MB." }, { status: 400 });
      format = /\.xml$/i.test(file.name) || file.type.includes("xml") ? "xml" : "json";
      content = await file.text();
    } else {
      const url = safeRemoteUrl(store.feedUrl || "");
      if (!url) return NextResponse.json({ error: "Configure uma URL pública válida para sincronizar." }, { status: 400 });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch(url, { signal: controller.signal, headers: { accept: "application/json, application/xml, text/xml, text/html" } });
        if (!response.ok) return NextResponse.json({ error: `A integração respondeu com HTTP ${response.status}.` }, { status: 400 });
        content = await response.text();
        if (content.length > 5 * 1024 * 1024) return NextResponse.json({ error: "O feed excede o limite de 5 MB." }, { status: 400 });
        const contentType=response.headers.get("content-type")||"";
        if(store.integrationType==="website"||contentType.includes("text/html")){
          const visible=content.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/\s+/g," ");
          const extracted=await extractStoreCatalogWithOpenAI({sourceUrl:url.toString(),pageText:visible});
          content=JSON.stringify(extracted);format="json";
        } else format = store.integrationType === "xml" || contentType.includes("xml") ? "xml" : "json";
      } finally { clearTimeout(timeout); }
    }
    const records = parsePayload(content, format);
    const normalized = records.map((record, index) => normalizeRecord(record, store, index)).filter((item): item is ImportedStoreListing => Boolean(item));
    if (!normalized.length) return NextResponse.json({ error: "Nenhum anúncio válido foi encontrado no arquivo ou feed." }, { status: 400 });
    const imported = await replaceIntegratedListings(store, normalized);
    return NextResponse.json({ imported, found: normalized.length, message: `${imported} anúncio(s) importado(s) para a loja.` });
  } catch (error) {
    const message = error instanceof SyntaxError ? "O arquivo JSON é inválido." : error instanceof Error && error.name === "AbortError" ? "A integração excedeu o tempo limite." : "Não foi possível processar a integração.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export const dynamic = "force-dynamic";
