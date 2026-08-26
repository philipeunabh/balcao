import type { ImportedLegalPublication } from "../db/legal-publications";

type UnknownRecord = Record<string, unknown>;

const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^\[?::1\]?$/,
  /\.local$/i,
];

function isPrivate172(hostname: string) {
  const match = hostname.match(/^172\.(\d{1,3})\./);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

export function safePublicHttpUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return (url.protocol === "https:" || url.protocol === "http:")
      && !BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(hostname))
      && !isPrivate172(hostname);
  } catch {
    return false;
  }
}

export function wordpressLegalEndpoint(value: string) {
  const url = new URL(value.trim());
  const cleanPath = url.pathname.replace(/\/+$/, "");
  const looksLikeCustomJson = /\.json$/i.test(cleanPath) || url.searchParams.has("rest_route");
  if (!/\/wp-json\//i.test(`${cleanPath}/`) && !looksLikeCustomJson) {
    url.pathname = `${cleanPath}/wp-json/wp/v2/posts`;
  } else if (/\/wp-json$/i.test(cleanPath)) {
    url.pathname = `${cleanPath}/wp/v2/posts`;
  }
  if (/\/wp\/v2\/posts\/?$/i.test(url.pathname)) {
    if (!url.searchParams.has("per_page")) url.searchParams.set("per_page", "100");
    if (!url.searchParams.has("_embed")) url.searchParams.set("_embed", "wp:featuredmedia");
    if (!url.searchParams.has("orderby")) url.searchParams.set("orderby", "date");
    if (!url.searchParams.has("order")) url.searchParams.set("order", "desc");
  }
  return url;
}

function objectValue(value: unknown, key: string) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)[key]
    : undefined;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function decodeHtml(value: string) {
  const named: Record<string, string> = {
    amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", ndash: "–", mdash: "—",
  };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#")) {
      const hexadecimal = entity[1]?.toLowerCase() === "x";
      const codePoint = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function htmlToText(value: string) {
  return decodeHtml(value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n")
    .replace(/<\/li\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[\t\r ]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function collectStrings(value: unknown, output: string[], seen: Set<unknown>, depth = 0) {
  if (depth > 7 || value == null || seen.has(value)) return;
  if (typeof value === "string") {
    output.push(value);
    return;
  }
  if (typeof value !== "object") return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, output, seen, depth + 1));
    return;
  }
  Object.values(value as UnknownRecord).forEach((item) => collectStrings(item, output, seen, depth + 1));
}

function urlsFromStrings(strings: string[], baseUrl: URL) {
  const candidates = new Set<string>();
  for (const raw of strings) {
    const decoded = decodeHtml(raw).replace(/\\\//g, "/");
    const direct = decoded.match(/https?:\/\/[^\s"'<>]+/gi) || [];
    const attributes = [...decoded.matchAll(/(?:href|src)=["']([^"']+)["']/gi)].map((match) => match[1]);
    for (const candidate of [...direct, ...attributes, decoded.trim()]) {
      try {
        const url = new URL(candidate.replace(/[),.;]+$/, ""), baseUrl);
        if (url.protocol === "https:" || url.protocol === "http:") candidates.add(url.toString());
      } catch { /* Ignora texto que não representa uma URL. */ }
    }
  }
  return [...candidates];
}

function publicationCollection(payload: unknown) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const root = payload as UnknownRecord;
  return [root.posts, root.publications, root.editais, root.items, root.data].find(Array.isArray) || [];
}

function preferredFeaturedImage(record: UnknownRecord) {
  const embedded = objectValue(record, "_embedded");
  const featured = objectValue(embedded, "wp:featuredmedia");
  const featuredItem = Array.isArray(featured) ? featured[0] : undefined;
  return firstString(
    objectValue(featuredItem, "source_url"),
    objectValue(featuredItem, "url"),
    record.featured_image_url,
    record.featuredImage,
    record.image,
  );
}

function filenameFromUrl(value: string) {
  try {
    const filename = decodeURIComponent(new URL(value).pathname.split("/").pop() || "edital.pdf");
    return filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`;
  } catch {
    return "edital.pdf";
  }
}

function normalizedDate(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString();
}

function resolvePublicUrl(value: string, baseUrl: URL) {
  if (!value) return null;
  try {
    const resolved = new URL(decodeHtml(value), baseUrl).toString();
    return safePublicHttpUrl(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

async function stableId(sourceUrl: URL, sourceId: string) {
  const input = new TextEncoder().encode(`${sourceUrl.origin}${sourceUrl.pathname}|${sourceId}`);
  const hash = await crypto.subtle.digest("SHA-256", input);
  const hex = [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `wp-${hex.slice(0, 32)}`;
}

export async function normalizeWordpressLegalPayload(payload: unknown, endpoint: URL) {
  const records = publicationCollection(payload)
    .slice(0, 100)
    .filter((item): item is UnknownRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item));
  const normalized = await Promise.all(records.map(async (record, index): Promise<ImportedLegalPublication | null> => {
    const strings: string[] = [];
    collectStrings(record, strings, new Set());
    const urls = urlsFromStrings(strings, endpoint);
    const originalPdfUrl = urls.find((url) => /\.pdf(?:$|[?#])/i.test(url));
    if (!originalPdfUrl || !safePublicHttpUrl(originalPdfUrl)) return null;

    const rawTitle = firstString(objectValue(record.title, "rendered"), record.title, record.name);
    const content = firstString(
      objectValue(record.excerpt, "rendered"),
      objectValue(record.content, "rendered"),
      record.description,
      record.text,
    );
    const filename = filenameFromUrl(originalPdfUrl);
    const fallbackTitle = filename.replace(/\.pdf$/i, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
    const sourceId = firstString(record.id == null ? "" : String(record.id), record.slug, originalPdfUrl) || String(index);
    const sourcePostUrl = firstString(record.link, record.url);
    const featuredImage = resolvePublicUrl(preferredFeaturedImage(record), endpoint);
    const imageUrl = featuredImage
      ? featuredImage
      : urls.find((url) => /\.(?:avif|webp|png|jpe?g)(?:$|[?#])/i.test(url) && !/logo|avatar|icon/i.test(url)) || null;

    return {
      id: await stableId(endpoint, sourceId),
      sourceId,
      title: htmlToText(rawTitle || fallbackTitle).slice(0, 220),
      body: htmlToText(content).slice(0, 20_000),
      filename: filename.slice(0, 240),
      originalPdfUrl,
      initialImageUrl: imageUrl,
      sourcePostUrl: resolvePublicUrl(sourcePostUrl, endpoint),
      publishedAt: normalizedDate(firstString(record.date_gmt, record.date, record.published_at, record.publishedAt)),
    };
  }));
  return normalized.filter((item): item is ImportedLegalPublication => Boolean(item));
}
