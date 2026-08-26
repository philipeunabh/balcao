import { readListingAiOverrides } from "./ai-review";
import {
  findStoredListingById,
  getListingSellerProfiles,
  listImportedVehicleListings,
  listStoredListings,
  type ListingSellerProfile,
  type StoredListing,
} from "./listings";
import { listActiveStoreListingsForPortal } from "./stores";
import { classifyListingLocally, makeListingSourceRecordsUnique, normalizeListingSourceRecord, type ImportRecord, type UnknownListingSourceRecord } from "./listing-import";
import { readPortalSettings } from "./settings";
import { mapCategory, portalCategories } from "../app/categories";

export type PublicListing = {
  id: string;
  url: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  subcategory: string;
  price: number | null;
  formattedPrice: string;
  locationLabel: string;
  latitude: number | null;
  longitude: number | null;
  images: string[];
  coverImage: string | null;
  featured: boolean;
  createdAt: string | null;
  status: string;
  negotiationType: string;
  attributes: Record<string, string | number | boolean>;
  features: string[];
  publicationType: string;
  featuredPlan: string | null;
  paymentStatus: string | null;
  paymentMethod: string | null;
  paymentAmountCents: number | null;
  paymentExpiresAt: string | null;
  storeListing?: boolean;
  imported?: boolean;
  seller: { name?: string; avatar?: string; email?: string; sellerEmail?: string };
  aiReviewed?: boolean;
  analytics?: { views: number; pageViews: number; sessions: number; phoneClicks: number; whatsappClicks: number };
};

function parseJson<T>(value: string, fallback: T) {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function normalizeStored(row: StoredListing, profile?: ListingSellerProfile): PublicListing {
  const images = parseJson<string[]>(row.imagesJson, []).filter(Boolean);
  const priceCents = row.negotiable ? null : row.monthlyRentCents ?? row.priceCents;
  const formattedPrice = row.negotiable || !priceCents
    ? "Valor a combinar"
    : `${(priceCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}${row.monthlyRentCents ? "/mês" : ""}`;

  return {
    id: row.id,
    url: `/anuncio/${encodeURIComponent(row.id)}`,
    slug: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    subcategory: row.subcategory,
    price: priceCents == null ? null : priceCents / 100,
    formattedPrice,
    locationLabel: row.address,
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    images,
    coverImage: row.coverImage || images[0] || null,
    featured: (row.publicationType === "featured" || row.publicationType === "super_featured") && row.paymentStatus === "paid",
    createdAt: row.createdAt,
    status: row.status,
    negotiationType: row.negotiationType,
    attributes: parseJson(row.attributesJson, {}),
    features: parseJson(row.featuresJson, []),
    publicationType: row.publicationType,
    featuredPlan: row.featuredPlan,
    paymentStatus: row.paymentStatus,
    paymentMethod: row.paymentMethod,
    paymentAmountCents: row.paymentAmountCents,
    paymentExpiresAt: row.paymentExpiresAt,
    seller: {
      name: row.displayName || profile?.name,
      avatar: profile?.profileImageUrl || undefined,
    },
    imported: ["importacao@balcao.com", "importacao@balcao.com.br", "importacao@palcao.com.br"].includes((profile?.email || "").toLowerCase()),
  };
}

function normalizeStoreListing(row: Record<string, unknown>): PublicListing {
  const priceCents = row.priceCents == null ? null : Number(row.priceCents);
  const images = parseJson<string[]>(String(row.imagesJson || "[]"),[]).filter(Boolean);
  return {
    id: `store:${String(row.storeId)}:${String(row.id)}`,
    url: `/loja/${encodeURIComponent(String(row.storeSlug))}/anuncio/${encodeURIComponent(String(row.id))}`,
    slug: `store:${String(row.storeId)}:${String(row.id)}`, title: String(row.title), description: String(row.description || ""),
    category: String(row.category), subcategory: String(row.subcategory), price: priceCents == null ? null : priceCents / 100,
    formattedPrice: priceCents == null ? "Valor a combinar" : (priceCents / 100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}),
    locationLabel: String(row.address || ""), latitude: null, longitude: null, images, coverImage: String(row.coverImage || images[0] || ""),
    featured: false, createdAt: String(row.createdAt || ""), status: "active", negotiationType: "Venda",
    attributes: parseJson(String(row.attributesJson || "{}"),{}), features: [], publicationType: "store", featuredPlan: null,
    paymentStatus: null, paymentMethod: null, paymentAmountCents: null, paymentExpiresAt: null, storeListing: true,
    seller: { name: String(row.storeName || "Loja Balcão"), avatar: row.storeLogo ? String(row.storeLogo) : undefined },
  };
}

let publicCache: { expiresAt: number; data: PublicListing[] } | null = null;
let homeCache: { expiresAt: number; data: PublicListing[] } | null = null;
let externalCache: { expiresAt: number; sourceUrl: string; data: PublicListing[] } | null = null;

const DEFAULT_LISTINGS_API_URL = process.env.LISTINGS_API_URL ?? "https://ow7hfhirtmiiw.kimi.page/data/api.json";

function externalPublicListing(record: ImportRecord, source: UnknownListingSourceRecord): PublicListing | null {
  const classification = classifyListingLocally(record, portalCategories);
  const price = record.priceCents == null ? null : record.priceCents / 100;
  const sourceStatus = String(source.status || "publish").toLowerCase();
  if (!["publish", "published", "active", "ativo"].includes(sourceStatus)) return null;
  const attributes: Record<string, string | number | boolean> = {};
  if (record.sourceUrl) attributes.sourceUrl = record.sourceUrl;
  return {
    id: record.id,
    url: `/anuncio/${encodeURIComponent(record.id)}`,
    slug: record.id,
    title: record.title,
    description: record.description,
    category: classification.category,
    subcategory: classification.subcategory,
    price,
    formattedPrice: price == null || price === 0
      ? "Valor a combinar"
      : price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
    locationLabel: "Belo Horizonte, MG",
    latitude: -19.9166813,
    longitude: -43.9344931,
    images: record.images,
    coverImage: record.images[0] || "/favicon.svg",
    featured: false,
    createdAt: record.createdAt,
    status: "active",
    negotiationType: /alug|locaç|locacao/i.test(`${record.title} ${record.description}`) ? "Aluguel" : "Venda",
    attributes,
    features: [],
    publicationType: "free",
    featuredPlan: null,
    paymentStatus: null,
    paymentMethod: null,
    paymentAmountCents: null,
    paymentExpiresAt: null,
    imported: true,
    seller: { name: record.displayName },
  } satisfies PublicListing;
}

async function externalListings(options: { fresh?: boolean } = {}) {
  let sourceUrl = DEFAULT_LISTINGS_API_URL;
  try {
    const settings = await readPortalSettings();
    if (typeof settings.listing_import_url === "string" && /^https?:\/\//i.test(settings.listing_import_url)) sourceUrl = settings.listing_import_url;
  } catch { /* O catálogo público padrão continua disponível sem configurações salvas. */ }
  if (!options.fresh && externalCache && externalCache.sourceUrl === sourceUrl && externalCache.expiresAt > Date.now()) return externalCache.data;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    let response: Response;
    try { response = await fetch(sourceUrl, { signal: controller.signal, headers: { accept: "application/json" } }); }
    finally { clearTimeout(timeout); }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json: unknown = await response.json();
    const root = json && typeof json === "object" ? json as UnknownListingSourceRecord : {};
    const collection = Array.isArray(json)
      ? json
      : ["listings", "anuncios", "ads", "items", "data"].map((key) => root[key]).find(Array.isArray);
    if (!Array.isArray(collection)) throw new Error("LISTING_COLLECTION_NOT_FOUND");
    const sources = collection.slice(0, 3_000).filter((item): item is UnknownListingSourceRecord => Boolean(item) && typeof item === "object");
    const records = makeListingSourceRecordsUnique(sources.flatMap((item, index) => {
      const record = normalizeListingSourceRecord(item, index);
      return record ? [record] : [];
    }));
    const data = records.flatMap((record, index) => {
      const normalized = externalPublicListing(record, sources[index] || {});
      return normalized ? [normalized] : [];
    });
    externalCache = { data, sourceUrl, expiresAt: Date.now() + 300_000 };
    return data;
  } catch {
    return externalCache?.data || [];
  }
}

export function invalidatePublicListingsCache() {
  publicCache = null;
  homeCache = null;
}

function listingRank(item: PublicListing) {
  if (item.publicationType === "super_featured" && item.paymentStatus === "paid") return 4;
  if (item.publicationType === "featured" && item.paymentStatus === "paid") return 3;
  // Publicações reais de usuários entram antes do catálogo complementar das lojas.
  return item.storeListing ? 1 : 2;
}

function orderListings(items: PublicListing[]) {
  return items.sort((a, b) => listingRank(b) - listingRank(a) || Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""));
}

function coverOnly(item: PublicListing): PublicListing {
  const cover = item.coverImage || item.images[0] || null;
  return { ...item, coverImage: cover, images: cover ? [cover] : [] };
}

async function applyOverrides(listings: PublicListing[]) {
  const overrides = await readListingAiOverrides(listings.map((item) => item.id));
  return listings.map((item) => {
    const override = overrides.get(item.id);
    return override
      ? { ...item, category: override.category, subcategory: override.subcategory, aiReviewed: true }
      : item;
  });
}

export async function getPublicListings(options: { includePending?: boolean; fresh?: boolean } = {}) {
  const includePending = options.includePending === true;
  if (!includePending && !options.fresh && publicCache && publicCache.expiresAt > Date.now()) return publicCache.data;
  try {
    const [stored,storeRows,external] = await Promise.all([
      listStoredListings(includePending),
      includePending ? [] : listActiveStoreListingsForPortal(),
      includePending ? [] : externalListings({ fresh: options.fresh }),
    ]);
    const profiles = await getListingSellerProfiles(stored.map((listing) => listing.userId));
    const regular = await applyOverrides(stored.map((listing) => normalizeStored(listing, profiles.get(listing.userId))));
    const data = orderListings([...new Map([
      ...external,
      ...regular,
      ...storeRows.map(normalizeStoreListing),
    ].map((listing) => [listing.id, listing])).values()]);
    if (!includePending) publicCache = { data, expiresAt: Date.now() + 60_000 };
    return data;
  } catch {
    return !includePending && publicCache ? publicCache.data : [];
  }
}

export async function getHomeListings(options: { regularLimit?: number; storeLimit?: number; fresh?: boolean } = {}) {
  if (!options.fresh && homeCache && homeCache.expiresAt > Date.now()) return homeCache.data;
  const regularLimit = Math.min(Math.max(options.regularLimit || 140, 20), 400);
  const storeLimit = Math.min(Math.max(options.storeLimit || 30, 1), 100);
  try {
    // Ativa primeiro as importações técnicas; depois busca uma amostra própria
    // de veículos para que a linha da home não dependa da distribuição das
    // categorias entre os anúncios gerais mais recentes.
    const stored = await listStoredListings(false, regularLimit);
    const [importedVehicles, storeRows, external] = await Promise.all([
      listImportedVehicleListings(),
      listActiveStoreListingsForPortal(storeLimit),
      externalListings({ fresh: options.fresh }),
    ]);
    const combined = [...new Map([...stored, ...importedVehicles].map((listing) => [listing.id, listing])).values()];
    const profiles = await getListingSellerProfiles(combined.map((listing) => listing.userId));
    const regular = await applyOverrides(combined.map((listing) => normalizeStored(listing, profiles.get(listing.userId))));
    const externalVehicles = external.filter((listing) => mapCategory(listing.category) === "Veículos").slice(0, 100);
    const externalRecent = external.slice(0, regularLimit);
    const data = orderListings([...new Map([
      ...externalRecent,
      ...externalVehicles,
      ...regular,
      ...storeRows.map(normalizeStoreListing),
    ].map((listing) => [listing.id, listing])).values()]).map(coverOnly);
    homeCache = { data, expiresAt: Date.now() + 60_000 };
    return data;
  } catch {
    return homeCache?.data || [];
  }
}

export async function getPublicListing(id: string) {
  if (publicCache && publicCache.expiresAt > Date.now()) {
    const cached = publicCache.data.find((item) => item.id === id);
    if (cached) return cached;
  }
  try {
    const row = await findStoredListingById(id);
    if (!row) return (await externalListings()).find((item) => item.id === id) || null;
    const profiles = await getListingSellerProfiles([row.userId]);
    const [item] = await applyOverrides([normalizeStored(row, profiles.get(row.userId))]);
    return item || null;
  } catch { return (await externalListings()).find((item) => item.id === id) || null; }
}
