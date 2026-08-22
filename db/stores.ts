import { ensureCustomerTables } from "./customer-auth";

export type StoreType = "real_estate" | "vehicle" | "general";
export type StorePlanCode = "store-free" | "store-pro" | "store-unlimited";
export type StoreIntegrationType = "manual" | "xml" | "json" | "api" | "wordpress" | "website" | "partner";
export type StoreSocialLinks = { instagram?: string; facebook?: string; youtube?: string; tiktok?: string; linkedin?: string };

export type VirtualStoreRecord = {
  id: string;
  userId: number;
  slug: string;
  name: string;
  type: StoreType;
  logoUrl: string | null;
  bannerUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  description: string;
  planCode: StorePlanCode;
  adLimit: number;
  integrationType: StoreIntegrationType;
  feedUrl: string | null;
  partnerName: string | null;
  websiteUrl: string | null;
  email: string;
  phone: string;
  whatsapp: string;
  socialLinks: StoreSocialLinks;
  address: string;
  city: string;
  state: string;
  active: boolean;
  isDemo: boolean;
  planStartedAt: string | null;
  planEndsAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StoreListingRecord = {
  id: string;
  storeId: string;
  title: string;
  description: string;
  category: string;
  subcategory: string;
  priceCents: number | null;
  address: string;
  coverImage: string;
  imagesJson: string;
  attributesJson: string;
  externalUrl: string | null;
  source: string;
  featured: boolean;
  status: string;
  createdAt: string;
};

export const virtualStorePlans = {
  "store-free": { code: "store-free" as const, name: "Loja Essencial", priceCents: 0, adLimit: 50 },
  "store-pro": { code: "store-pro" as const, name: "Loja Profissional", priceCents: 9900, adLimit: 200 },
  "store-unlimited": { code: "store-unlimited" as const, name: "Loja Ilimitada", priceCents: 24900, adLimit: 999999 },
};

function mapStore(row: Record<string, unknown>): VirtualStoreRecord {
  return {
    id: String(row.id), userId: Number(row.userId), slug: String(row.slug), name: String(row.name),
    type: String(row.type) as StoreType, logoUrl: row.logoUrl ? String(row.logoUrl) : null,
    bannerUrl: row.bannerUrl ? String(row.bannerUrl) : null,
    primaryColor: String(row.primaryColor || "#d71920"), secondaryColor: String(row.secondaryColor || "#17191e"),
    description: String(row.description || ""), planCode: String(row.planCode) as StorePlanCode,
    adLimit: Number(row.adLimit), integrationType: String(row.integrationType) as StoreIntegrationType,
    feedUrl: row.feedUrl ? String(row.feedUrl) : null, partnerName: row.partnerName ? String(row.partnerName) : null,
    websiteUrl: row.websiteUrl ? String(row.websiteUrl) : null, email: String(row.email || ""), phone: String(row.phone || ""),
    whatsapp: String(row.whatsapp || ""), socialLinks: safeSocialLinks(String(row.socialLinksJson || "{}")), address: String(row.address || ""), city: String(row.city || ""),
    state: String(row.state || ""), active: Boolean(row.active), isDemo: Boolean(row.isDemo),
    planStartedAt: row.planStartedAt ? String(row.planStartedAt) : null, planEndsAt: row.planEndsAt ? String(row.planEndsAt) : null,
    createdAt: String(row.createdAt), updatedAt: String(row.updatedAt),
  };
}

function safeSocialLinks(value: string): StoreSocialLinks {
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" ? parsed as StoreSocialLinks : {}; }
  catch { return {}; }
}

function mapListing(row: Record<string, unknown>): StoreListingRecord {
  return {
    id: String(row.id), storeId: String(row.storeId), title: String(row.title), description: String(row.description),
    category: String(row.category), subcategory: String(row.subcategory), priceCents: row.priceCents == null ? null : Number(row.priceCents),
    address: String(row.address), coverImage: String(row.coverImage), imagesJson: String(row.imagesJson || "[]"),
    attributesJson: String(row.attributesJson || "{}"), externalUrl: row.externalUrl ? String(row.externalUrl) : null,
    source: String(row.source || "manual"),
    featured: Boolean(row.featured), status: String(row.status), createdAt: String(row.createdAt),
  };
}

const storeSelect = `SELECT id, user_id AS userId, slug, name, type, logo_url AS logoUrl, banner_url AS bannerUrl,
  primary_color AS primaryColor, secondary_color AS secondaryColor, description,
  plan_code AS planCode, ad_limit AS adLimit, integration_type AS integrationType, feed_url AS feedUrl,
  partner_name AS partnerName, website_url AS websiteUrl, email, phone, whatsapp, social_links_json AS socialLinksJson,
  address, city, state, active, is_demo AS isDemo, plan_started_at AS planStartedAt, plan_ends_at AS planEndsAt,
  created_at AS createdAt, updated_at AS updatedAt FROM portal_virtual_stores`;

const listingSelect = `SELECT id, store_id AS storeId, title, description, category, subcategory,
  price_cents AS priceCents, address, cover_image AS coverImage, images_json AS imagesJson,
  attributes_json AS attributesJson, external_url AS externalUrl, source, featured, status, created_at AS createdAt
  FROM portal_store_listings`;

export async function ensureStoreTables() {
  const { env } = await import("cloudflare:workers");
  await ensureCustomerTables();
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS portal_virtual_stores (
      id TEXT PRIMARY KEY NOT NULL, user_id INTEGER NOT NULL UNIQUE, slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'general', logo_url TEXT, banner_url TEXT,
      primary_color TEXT NOT NULL DEFAULT '#d71920', secondary_color TEXT NOT NULL DEFAULT '#17191e', description TEXT NOT NULL DEFAULT '',
      plan_code TEXT NOT NULL DEFAULT 'store-free', ad_limit INTEGER NOT NULL DEFAULT 50,
      integration_type TEXT NOT NULL DEFAULT 'manual', feed_url TEXT, partner_name TEXT, website_url TEXT,
      email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', whatsapp TEXT NOT NULL DEFAULT '', social_links_json TEXT NOT NULL DEFAULT '{}',
      address TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '', state TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1, is_demo INTEGER NOT NULL DEFAULT 0, plan_started_at TEXT, plan_ends_at TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS portal_virtual_stores_type_idx ON portal_virtual_stores (type, active, name)"),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS portal_store_listings (
      id TEXT PRIMARY KEY NOT NULL, store_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL,
      category TEXT NOT NULL, subcategory TEXT NOT NULL, price_cents INTEGER, address TEXT NOT NULL,
      cover_image TEXT NOT NULL, images_json TEXT NOT NULL DEFAULT '[]', attributes_json TEXT NOT NULL DEFAULT '{}', external_url TEXT,
      source TEXT NOT NULL DEFAULT 'manual', featured INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS portal_store_listings_store_idx ON portal_store_listings (store_id, status, created_at)"),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS portal_store_renewal_requests (
      id TEXT PRIMARY KEY NOT NULL, store_id TEXT NOT NULL, user_id INTEGER NOT NULL,
      requested_plan_code TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS portal_store_renewal_requests_store_idx ON portal_store_renewal_requests (store_id, created_at)"),
  ]);
  const storeColumns = await env.DB.prepare("PRAGMA table_info(portal_virtual_stores)").all<{ name: string }>();
  const storeColumnNames = new Set(storeColumns.results.map((column) => column.name));
  if (!storeColumnNames.has("website_url")) await env.DB.prepare("ALTER TABLE portal_virtual_stores ADD COLUMN website_url TEXT").run();
  if (!storeColumnNames.has("address")) await env.DB.prepare("ALTER TABLE portal_virtual_stores ADD COLUMN address TEXT NOT NULL DEFAULT ''").run();
  if (!storeColumnNames.has("banner_url")) await env.DB.prepare("ALTER TABLE portal_virtual_stores ADD COLUMN banner_url TEXT").run();
  if (!storeColumnNames.has("primary_color")) await env.DB.prepare("ALTER TABLE portal_virtual_stores ADD COLUMN primary_color TEXT NOT NULL DEFAULT '#d71920'").run();
  if (!storeColumnNames.has("secondary_color")) await env.DB.prepare("ALTER TABLE portal_virtual_stores ADD COLUMN secondary_color TEXT NOT NULL DEFAULT '#17191e'").run();
  if (!storeColumnNames.has("phone")) await env.DB.prepare("ALTER TABLE portal_virtual_stores ADD COLUMN phone TEXT NOT NULL DEFAULT ''").run();
  if (!storeColumnNames.has("social_links_json")) await env.DB.prepare("ALTER TABLE portal_virtual_stores ADD COLUMN social_links_json TEXT NOT NULL DEFAULT '{}'").run();
  if (!storeColumnNames.has("plan_started_at")) await env.DB.prepare("ALTER TABLE portal_virtual_stores ADD COLUMN plan_started_at TEXT").run();
  if (!storeColumnNames.has("plan_ends_at")) await env.DB.prepare("ALTER TABLE portal_virtual_stores ADD COLUMN plan_ends_at TEXT").run();
  const listingColumns = await env.DB.prepare("PRAGMA table_info(portal_store_listings)").all<{ name: string }>();
  const listingColumnNames = new Set(listingColumns.results.map((column) => column.name));
  if (!listingColumnNames.has("external_url")) await env.DB.prepare("ALTER TABLE portal_store_listings ADD COLUMN external_url TEXT").run();
}

export async function listVirtualStores(type?: StoreType): Promise<VirtualStoreRecord[]> {
  const { env } = await import("cloudflare:workers");
  await ensureStoreTables();
  const now = new Date().toISOString();
  const activePeriod = "active = 1 AND is_demo = 0 AND (plan_started_at IS NULL OR plan_started_at <= ?) AND (plan_ends_at IS NULL OR plan_ends_at >= ?)";
  const query = type
    ? env.DB.prepare(`${storeSelect} WHERE ${activePeriod} AND type = ? ORDER BY name`).bind(now, now, type)
    : env.DB.prepare(`${storeSelect} WHERE ${activePeriod} ORDER BY name`).bind(now, now);
  const rows = await query.all<Record<string, unknown>>();
  return rows.results.map(mapStore);
}

export async function getVirtualStoreBySlug(slug: string): Promise<VirtualStoreRecord | null> {
  const { env } = await import("cloudflare:workers");
  await ensureStoreTables();
  const now = new Date().toISOString();
  const row = await env.DB.prepare(`${storeSelect} WHERE slug = ? AND active = 1 AND is_demo = 0 AND (plan_started_at IS NULL OR plan_started_at <= ?) AND (plan_ends_at IS NULL OR plan_ends_at >= ?) LIMIT 1`).bind(slug, now, now).first<Record<string, unknown>>();
  return row ? mapStore(row) : null;
}

export async function getVirtualStoreByUser(userId: number): Promise<VirtualStoreRecord | null> {
  const { env } = await import("cloudflare:workers");
  await ensureStoreTables();
  const row = await env.DB.prepare(`${storeSelect} WHERE user_id = ? LIMIT 1`).bind(userId).first<Record<string, unknown>>();
  return row ? mapStore(row) : null;
}

export async function listStoreListings(storeId: string): Promise<StoreListingRecord[]> {
  const { env } = await import("cloudflare:workers");
  await ensureStoreTables();
  const rows = await env.DB.prepare(`${listingSelect} WHERE store_id = ? AND status = 'active' ORDER BY featured DESC, created_at DESC`).bind(storeId).all<Record<string, unknown>>();
  return rows.results.map(mapListing);
}

export async function listActiveStoreListingsForPortal(limit = 3000) {
  const { env } = await import("cloudflare:workers"); await ensureStoreTables();
  const now = new Date().toISOString();
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 3000);
  return (await env.DB.prepare(`SELECT l.id,l.store_id AS storeId,l.title,l.description,l.category,l.subcategory,
    l.price_cents AS priceCents,l.address,l.cover_image AS coverImage,l.images_json AS imagesJson,
    l.attributes_json AS attributesJson,l.external_url AS externalUrl,l.created_at AS createdAt,
    s.slug AS storeSlug,s.name AS storeName,s.logo_url AS storeLogo
    FROM portal_store_listings l JOIN portal_virtual_stores s ON s.id=l.store_id
    WHERE l.status='active' AND s.active=1 AND s.is_demo=0 AND (s.plan_started_at IS NULL OR s.plan_started_at<=?)
      AND (s.plan_ends_at IS NULL OR s.plan_ends_at>=?) ORDER BY l.created_at DESC LIMIT ?`)
    .bind(now,now,safeLimit).all<Record<string,unknown>>()).results;
}

export async function getStoreListing(storeId: string, listingId: string): Promise<StoreListingRecord | null> {
  const { env } = await import("cloudflare:workers");
  await ensureStoreTables();
  const row = await env.DB.prepare(`${listingSelect} WHERE store_id = ? AND id = ? AND status = 'active' LIMIT 1`).bind(storeId, listingId).first<Record<string, unknown>>();
  return row ? mapListing(row) : null;
}

export async function saveVirtualStore(userId: number, input: {
  slug: string; name: string; type: StoreType; logoUrl: string | null; bannerUrl: string | null;
  primaryColor: string; secondaryColor: string; description: string; integrationType: StoreIntegrationType; feedUrl: string | null;
  partnerName: string | null; websiteUrl: string | null; email: string; phone: string; whatsapp: string;
  socialLinks: StoreSocialLinks; address: string; city: string; state: string;
}) {
  const { env } = await import("cloudflare:workers");
  await ensureCustomerTables();
  await ensureStoreTables();
  const existing = await getVirtualStoreByUser(userId);
  const plan = virtualStorePlans[existing?.planCode || "store-free"];
  const id = existing?.id || crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO portal_virtual_stores
      (id, user_id, slug, name, type, logo_url, banner_url, primary_color, secondary_color, description,
       plan_code, ad_limit, integration_type, feed_url, partner_name, website_url, email, phone, whatsapp,
       social_links_json, address, city, state, active, is_demo, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET slug = excluded.slug, name = excluded.name, type = excluded.type,
      logo_url = excluded.logo_url, banner_url = excluded.banner_url, primary_color = excluded.primary_color,
      secondary_color = excluded.secondary_color, description = excluded.description,
      integration_type = excluded.integration_type, feed_url = excluded.feed_url,
      partner_name = excluded.partner_name, website_url = excluded.website_url, email = excluded.email,
      phone = excluded.phone, whatsapp = excluded.whatsapp, social_links_json = excluded.social_links_json,
      address = excluded.address, city = excluded.city, state = excluded.state, updated_at = excluded.updated_at`)
      .bind(id, userId, input.slug, input.name, input.type, input.logoUrl, input.bannerUrl, input.primaryColor,
        input.secondaryColor, input.description, plan.code, existing?.adLimit || plan.adLimit, input.integrationType,
        input.feedUrl, input.partnerName, input.websiteUrl, input.email, input.phone, input.whatsapp,
        JSON.stringify(input.socialLinks), input.address, input.city, input.state, now, now),
  ]);
  return getVirtualStoreByUser(userId);
}

export async function saveVirtualStoreFromAdmin(input: {
  userId: number; email: string; planCode: StorePlanCode; adLimit: number;
  planStartedAt: string | null; planEndsAt: string | null; active: boolean;
}) {
  const { env } = await import("cloudflare:workers");
  await Promise.all([ensureCustomerTables(), ensureStoreTables()]);
  const user = await env.DB.prepare("SELECT id,name,email,whatsapp FROM portal_users WHERE id=? LIMIT 1").bind(input.userId).first<{ id: number; name: string; email: string; whatsapp: string }>();
  if (!user) throw new Error("USER_NOT_FOUND");
  const existing = await getVirtualStoreByUser(user.id);
  const plan = virtualStorePlans[input.planCode];
  const now = new Date().toISOString();
  const id = existing?.id || crypto.randomUUID();
  const slugBase = user.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || `loja-${user.id}`;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO portal_virtual_stores
      (id,user_id,slug,name,type,description,plan_code,ad_limit,integration_type,email,whatsapp,active,is_demo,plan_started_at,plan_ends_at,created_at,updated_at)
      VALUES (?,?,?,?,'general','Loja virtual no Portal Balcão',?,?,'manual',?,?,?,0,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,plan_code=excluded.plan_code,ad_limit=excluded.ad_limit,
      active=excluded.active,plan_started_at=excluded.plan_started_at,plan_ends_at=excluded.plan_ends_at,updated_at=excluded.updated_at`)
      .bind(id,user.id,existing?.slug || `${slugBase}-${user.id}`,existing?.name || user.name,input.planCode,input.adLimit,input.email || user.email,user.whatsapp,input.active ? 1 : 0,input.planStartedAt,input.planEndsAt,now,now),
    env.DB.prepare("UPDATE portal_users SET plan_code=?,plan_name=?,ad_limit=?,updated_at=? WHERE id=?")
      .bind(plan.code,plan.name,input.adLimit,now,user.id),
  ]);
  return getVirtualStoreByUser(user.id);
}

export async function listVirtualStoresForAdmin() {
  const { env } = await import("cloudflare:workers");
  await ensureStoreTables();
  return (await env.DB.prepare(`SELECT s.*, u.name AS customerName, u.email AS customerEmail
    FROM (${storeSelect}) s JOIN portal_users u ON u.id=s.userId ORDER BY s.updatedAt DESC`)
    .all<Record<string, unknown>>()).results.map((row) => ({ ...mapStore(row), customerName: String(row.customerName || ""), customerEmail: String(row.customerEmail || "") }));
}

export function storePlanIsCurrent(store: VirtualStoreRecord) {
  const now = Date.now();
  return store.active && (!store.planStartedAt || Date.parse(store.planStartedAt) <= now) && (!store.planEndsAt || Date.parse(store.planEndsAt) >= now);
}

export async function requestStoreRenewal(store: VirtualStoreRecord, requestedPlanCode: StorePlanCode) {
  const { env } = await import("cloudflare:workers");
  await ensureStoreTables();
  const now = new Date().toISOString();
  const existing = await env.DB.prepare("SELECT id FROM portal_store_renewal_requests WHERE store_id=? AND status='pending' LIMIT 1").bind(store.id).first<{ id: string }>();
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO portal_store_renewal_requests (id,store_id,user_id,requested_plan_code,status,created_at,updated_at) VALUES (?,?,?,?,'pending',?,?)")
    .bind(id,store.id,store.userId,requestedPlanCode,now,now).run();
  return id;
}

export async function createManualStoreListing(store: VirtualStoreRecord, input: ImportedStoreListing) {
  const { env } = await import("cloudflare:workers");
  await ensureStoreTables();
  if (!storePlanIsCurrent(store)) throw new Error("STORE_INACTIVE");
  const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM portal_store_listings WHERE store_id=? AND status='active'").bind(store.id).first<{ total: number }>();
  if (Number(count?.total || 0) >= store.adLimit) throw new Error("STORE_LIMIT_REACHED");
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO portal_store_listings
    (id,store_id,title,description,category,subcategory,price_cents,address,cover_image,images_json,attributes_json,external_url,source,featured,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'manual',0,'active',?,?)`)
    .bind(id,store.id,input.title,input.description,input.category,input.subcategory,input.priceCents,input.address,input.coverImage,JSON.stringify(input.images),JSON.stringify(input.attributes),input.externalUrl,now,now).run();
  return id;
}

export async function deleteManualStoreListing(store: VirtualStoreRecord, listingId: string) {
  const { env } = await import("cloudflare:workers"); await ensureStoreTables();
  await env.DB.prepare("DELETE FROM portal_store_listings WHERE id=? AND store_id=? AND source='manual'").bind(listingId,store.id).run();
}

export type ImportedStoreListing = {
  title: string; description: string; category: string; subcategory: string; priceCents: number | null;
  address: string; coverImage: string; images: string[]; externalUrl: string | null;
  attributes: Record<string, string | number | boolean>;
};

export async function replaceIntegratedListings(store: VirtualStoreRecord, items: ImportedStoreListing[]) {
  const { env } = await import("cloudflare:workers");
  await ensureStoreTables();
  const limit = Math.min(items.length, store.adLimit >= 999999 ? 2000 : store.adLimit);
  const now = new Date().toISOString();
  await env.DB.prepare("DELETE FROM portal_store_listings WHERE store_id = ? AND source = 'integration'").bind(store.id).run();
  const statements = items.slice(0, limit).map((item, index) => env.DB.prepare(`INSERT INTO portal_store_listings
    (id, store_id, title, description, category, subcategory, price_cents, address, cover_image, images_json,
     attributes_json, external_url, source, featured, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'integration', 0, 'active', ?, ?)`)
    .bind(`${store.id}-integration-${String(index + 1).padStart(4, "0")}`, store.id, item.title, item.description,
      item.category, item.subcategory, item.priceCents, item.address, item.coverImage, JSON.stringify(item.images),
      JSON.stringify(item.attributes), item.externalUrl, now, now));
  for (let index = 0; index < statements.length; index += 50) await env.DB.batch(statements.slice(index, index + 50));
  return limit;
}
