import { ensureCustomerTables, type CustomerRecord } from "./customer-auth";
import { ensurePaymentTables, updatePaymentByReference } from "./payments";
import { ensureAnalyticsTables } from "./analytics";
import { updateInvoiceStatusByListing } from "./invoices";

export type ListingInput = {
  title: string; description: string; negotiationType: string; category: string; subcategory: string;
  priceCents: number | null; monthlyRentCents: number | null; iptuCents: number | null; condoCents: number | null;
  negotiable: boolean; address: string; latitude: number | null; longitude: number | null;
  displayName: string; whatsapp: string; attributes: Record<string, string | number | boolean>;
  features: string[]; images: string[]; publicationType: "free" | "featured" | "super_featured";
  featuredPlan: "monthly" | "quarterly" | "semiannual" | null;
  paymentMethod: "PIX" | "CREDIT_CARD" | null; paymentAmountCents: number | null;
};

export type StoredListing = {
  id: string; userId: number; title: string; description: string; negotiationType: string; category: string;
  subcategory: string; priceCents: number | null; monthlyRentCents: number | null; iptuCents: number | null;
  condoCents: number | null; negotiable: number; address: string; latitude: string | null; longitude: string | null;
  displayName: string; whatsapp: string; attributesJson: string; featuresJson: string; imagesJson: string;
  coverImage: string; publicationType: string; featuredPlan: string | null; featuredUntil: string | null; expiresAt: string | null;
  status: string; paymentProvider: string | null; paymentReference: string | null; paymentMethod: string | null;
  paymentAmountCents: number | null; paymentExpiresAt: string | null; paymentStatus: string | null; createdAt: string;
};

export async function ensureListingTables() {
  const { env } = await import("cloudflare:workers");
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS portal_listings (
      id TEXT PRIMARY KEY NOT NULL, user_id INTEGER NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL,
      negotiation_type TEXT NOT NULL, category TEXT NOT NULL, subcategory TEXT NOT NULL, price_cents INTEGER,
      monthly_rent_cents INTEGER, iptu_cents INTEGER, condo_cents INTEGER, negotiable INTEGER NOT NULL DEFAULT 0,
      address TEXT NOT NULL, latitude TEXT, longitude TEXT, display_name TEXT NOT NULL, whatsapp TEXT NOT NULL,
      attributes_json TEXT NOT NULL DEFAULT '{}', features_json TEXT NOT NULL DEFAULT '[]', images_json TEXT NOT NULL DEFAULT '[]',
      cover_image TEXT NOT NULL, publication_type TEXT NOT NULL DEFAULT 'free', featured_plan TEXT, featured_until TEXT, expires_at TEXT,
      status TEXT NOT NULL DEFAULT 'pending_review', payment_provider TEXT, payment_reference TEXT, payment_method TEXT,
      payment_amount_cents INTEGER, payment_expires_at TEXT, payment_status TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS portal_listings_user_id_idx ON portal_listings (user_id)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS portal_listings_status_idx ON portal_listings (status, created_at)"),
    env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS portal_listings_payment_reference_idx ON portal_listings (payment_reference) WHERE payment_reference IS NOT NULL"),
  ]);
}

function selectColumns() {
  return `id, user_id AS userId, title, description, negotiation_type AS negotiationType, category, subcategory,
    price_cents AS priceCents, monthly_rent_cents AS monthlyRentCents, iptu_cents AS iptuCents, condo_cents AS condoCents,
    negotiable, address, latitude, longitude, display_name AS displayName, whatsapp, attributes_json AS attributesJson,
    features_json AS featuresJson, images_json AS imagesJson, cover_image AS coverImage, publication_type AS publicationType,
    featured_plan AS featuredPlan, featured_until AS featuredUntil, expires_at AS expiresAt, status, payment_provider AS paymentProvider,
    payment_reference AS paymentReference, payment_method AS paymentMethod, payment_amount_cents AS paymentAmountCents,
    payment_expires_at AS paymentExpiresAt, payment_status AS paymentStatus, created_at AS createdAt`;
}

export async function createListing(customer: CustomerRecord, input: ListingInput) {
  const { env } = await import("cloudflare:workers");
  await ensureListingTables();
  const fresh = await env.DB.prepare("SELECT active_ads AS activeAds, ad_limit AS adLimit FROM portal_users WHERE id = ? AND status = 'active' LIMIT 1")
    .bind(customer.id).first<{ activeAds: number; adLimit: number }>();
  if (!fresh || fresh.activeAds >= fresh.adLimit) return { error: "Você atingiu o limite de anúncios do seu plano." } as const;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const promoted = input.publicationType === "featured" || input.publicationType === "super_featured";
  const status = promoted ? "awaiting_payment" : "pending_review";
  const expiresAt = input.publicationType === "free" ? new Date(Date.now() + 30 * 86_400_000).toISOString() : null;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO portal_listings (
      id, user_id, title, description, negotiation_type, category, subcategory, price_cents, monthly_rent_cents,
      iptu_cents, condo_cents, negotiable, address, latitude, longitude, display_name, whatsapp, attributes_json,
      features_json, images_json, cover_image, publication_type, featured_plan, expires_at, status, payment_provider, payment_method,
      payment_amount_cents, payment_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, customer.id, input.title, input.description, input.negotiationType, input.category, input.subcategory,
        input.priceCents, input.monthlyRentCents, input.iptuCents, input.condoCents, input.negotiable ? 1 : 0, input.address,
        input.latitude == null ? null : String(input.latitude), input.longitude == null ? null : String(input.longitude),
        input.displayName, input.whatsapp, JSON.stringify(input.attributes), JSON.stringify(input.features), JSON.stringify(input.images),
        input.images[0], input.publicationType, input.featuredPlan, expiresAt, status, promoted ? "pagbank" : null,
        input.paymentMethod, input.paymentAmountCents, promoted ? "pending" : null, now, now),
    env.DB.prepare("UPDATE portal_users SET active_ads = active_ads + 1, updated_at = ? WHERE id = ?").bind(now, customer.id),
  ]);
  return { id, status } as const;
}

export async function listStoredListings(includePending = false, limit?: number) {
  const { env } = await import("cloudflare:workers"); await ensureListingTables();
  const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(Number(limit), 1), 1000) : null;
  const query = includePending ? `SELECT ${selectColumns()} FROM portal_listings ORDER BY created_at DESC${safeLimit ? " LIMIT ?" : ""}`
    : `SELECT ${selectColumns()} FROM portal_listings WHERE status = 'active' ORDER BY created_at DESC${safeLimit ? " LIMIT ?" : ""}`;
  const statement = env.DB.prepare(query);
  return (await (safeLimit ? statement.bind(safeLimit) : statement).all<StoredListing>()).results;
}

export async function listImportedVehicleListings(limit = 40) {
  const { env } = await import("cloudflare:workers");
  await ensureListingTables();
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 5), 100);
  return (await env.DB.prepare(`SELECT ${selectColumns()} FROM portal_listings
    WHERE status = 'active'
      AND user_id IN (
        SELECT id FROM portal_users
        WHERE lower(email) IN (lower('importacao@balcao.com'), lower('importacao@balcao.com.br'), lower('importacao@palcao.com.br'))
      )
      AND (
        lower(category) IN ('veiculos', 'veículos', 'autos', 'auto')
        OR lower(category) LIKE '%veicul%'
        OR lower(category) LIKE '%veícul%'
      )
    ORDER BY created_at DESC
    LIMIT ?`).bind(safeLimit).all<StoredListing>()).results;
}

export async function findStoredListingById(id: string, includePending = false) {
  const { env } = await import("cloudflare:workers"); await ensureListingTables();
  const statusClause = includePending ? "" : "AND status = 'active'";
  return env.DB.prepare(`SELECT ${selectColumns()} FROM portal_listings WHERE id = ? ${statusClause} LIMIT 1`)
    .bind(id).first<StoredListing>();
}

export type ListingSellerProfile = { id: number; name: string; email: string; profileImageUrl: string | null };

export async function getListingSellerProfiles(userIds: number[]) {
  const { env } = await import("cloudflare:workers");
  await ensureCustomerTables();
  const uniqueIds = [...new Set(userIds.filter((id) => Number.isInteger(id) && id > 0))];
  const profiles = new Map<number, ListingSellerProfile>();
  for (let index = 0; index < uniqueIds.length; index += 50) {
    const chunk = uniqueIds.slice(index, index + 50);
    const placeholders = chunk.map(() => "?").join(",");
    const result = await env.DB.prepare(`SELECT id, name, email, profile_image_url AS profileImageUrl FROM portal_users WHERE id IN (${placeholders})`)
      .bind(...chunk).all<ListingSellerProfile>();
    for (const profile of result.results) profiles.set(profile.id, profile);
  }
  return profiles;
}

export async function getAdminListingMetadata(ids: string[]) {
  const { env } = await import("cloudflare:workers"); await Promise.all([ensureListingTables(), ensureAnalyticsTables()]);
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS portal_listing_contact_events (
    id TEXT PRIMARY KEY NOT NULL, listing_id TEXT NOT NULL, owner_user_id INTEGER NOT NULL, actor_key TEXT NOT NULL,
    actor_user_id INTEGER, event_type TEXT NOT NULL, created_at TEXT NOT NULL
  )`).run();
  const map = new Map<string, { sellerEmail: string; sellerName: string; views: number; pageViews: number; sessions: number; phoneClicks: number; whatsappClicks: number }>();
  for (let index = 0; index < ids.length; index += 80) {
    const chunk = ids.slice(index, index + 80); if (!chunk.length) continue;
    const placeholders = chunk.map(() => "?").join(",");
    const rows = (await env.DB.prepare(`SELECT l.id,u.email AS sellerEmail,u.name AS sellerName,
      (SELECT COUNT(*) FROM portal_listing_contact_events e WHERE e.listing_id=l.id AND e.event_type='detail_view') AS views,
      (SELECT COUNT(*) FROM portal_analytics_pageviews p WHERE p.listing_id=l.id) AS pageViews,
      (SELECT COUNT(DISTINCT p.session_id) FROM portal_analytics_pageviews p WHERE p.listing_id=l.id) AS sessions,
      (SELECT COUNT(*) FROM portal_listing_contact_events e WHERE e.listing_id=l.id AND e.event_type='phone_reveal') AS phoneClicks,
      (SELECT COUNT(*) FROM portal_listing_contact_events e WHERE e.listing_id=l.id AND e.event_type='whatsapp_click') AS whatsappClicks
      FROM portal_listings l JOIN portal_users u ON u.id=l.user_id WHERE l.id IN (${placeholders})`).bind(...chunk).all<{ id: string; sellerEmail: string; sellerName: string; views: number; pageViews: number; sessions: number; phoneClicks: number; whatsappClicks: number }>()).results;
    rows.forEach((row) => map.set(row.id, { sellerEmail: row.sellerEmail, sellerName: row.sellerName, views: Number(row.views || 0), pageViews: Number(row.pageViews || 0), sessions: Number(row.sessions || 0), phoneClicks: Number(row.phoneClicks || 0), whatsappClicks: Number(row.whatsappClicks || 0) }));
  }
  return map;
}

export async function listUserListings(userId: number) {
  const { env } = await import("cloudflare:workers"); await ensureListingTables();
  return (await env.DB.prepare(`SELECT ${selectColumns()} FROM portal_listings WHERE user_id = ? ORDER BY created_at DESC`).bind(userId).all<StoredListing>()).results;
}

export async function moderateListing(id: string, action: "approve" | "reject") {
  const { env } = await import("cloudflare:workers");
  await ensureListingTables();
  const listing = await env.DB.prepare(
    "SELECT id, user_id AS userId, status FROM portal_listings WHERE id = ? LIMIT 1",
  ).bind(id).first<{ id: string; userId: number; status: string }>();
  if (!listing) return { error: "Anúncio não encontrado." } as const;
  if (listing.status !== "pending_review") {
    return { error: "Somente anúncios pendentes podem ser moderados." } as const;
  }
  const now = new Date().toISOString();
  const status = action === "approve" ? "active" : "rejected";
  if (action === "reject") {
    await env.DB.batch([
      env.DB.prepare("UPDATE portal_users SET active_ads = CASE WHEN active_ads > 0 THEN active_ads - 1 ELSE 0 END, updated_at = ? WHERE id = ?")
        .bind(now, listing.userId),
      env.DB.prepare("UPDATE portal_listings SET status = 'rejected', updated_at = ? WHERE id = ? AND status = 'pending_review'")
        .bind(now, id),
    ]);
  } else {
    await env.DB.prepare("UPDATE portal_listings SET status = 'active', updated_at = ? WHERE id = ? AND status = 'pending_review'")
      .bind(now, id).run();
  }
  return { id, status } as const;
}

export async function setListingPaymentReference(id: string, reference: string, expiresAt: string | null = null) {
  const { env } = await import("cloudflare:workers"); await ensureListingTables();
  await env.DB.prepare("UPDATE portal_listings SET payment_reference = ?, payment_expires_at = ?, updated_at = ? WHERE id = ?")
    .bind(reference, expiresAt, new Date().toISOString(), id).run();
}

export async function setListingPaymentStatus(id: string, status: string) {
  const { env } = await import("cloudflare:workers"); await ensureListingTables();
  await env.DB.prepare("UPDATE portal_listings SET payment_status = ?, updated_at = ? WHERE id = ?")
    .bind(status, new Date().toISOString(), id).run();
}

export async function findListingForUser(id: string, userId: number) {
  const { env } = await import("cloudflare:workers"); await ensureListingTables();
  return env.DB.prepare(`SELECT ${selectColumns()} FROM portal_listings WHERE id = ? AND user_id = ? LIMIT 1`).bind(id, userId).first<StoredListing>();
}

export type ListingEditInput = {
  title: string; description: string; negotiationType: string; category: string; subcategory: string;
  priceCents: number | null; monthlyRentCents: number | null; iptuCents: number | null; condoCents: number | null;
  negotiable: boolean; address: string; latitude: number | null; longitude: number | null; displayName: string;
  whatsapp: string; attributes: Record<string, string | number | boolean>; features: string[]; images: string[];
};

function listingEditSnapshot(input: ListingEditInput | StoredListing) {
  const row = input as StoredListing;
  return JSON.stringify({
    title: input.title.trim(), description: input.description.trim(), negotiationType: input.negotiationType,
    category: input.category, subcategory: input.subcategory, priceCents: input.priceCents,
    monthlyRentCents: input.monthlyRentCents, iptuCents: input.iptuCents, condoCents: input.condoCents,
    negotiable: Boolean(input.negotiable), address: input.address.trim(), latitude: input.latitude == null ? null : Number(input.latitude),
    longitude: input.longitude == null ? null : Number(input.longitude), displayName: input.displayName.trim(), whatsapp: input.whatsapp,
    attributes: "attributes" in input ? input.attributes : JSON.parse(row.attributesJson || "{}"),
    features: "features" in input ? input.features : JSON.parse(row.featuresJson || "[]"),
    images: "images" in input ? input.images : JSON.parse(row.imagesJson || "[]"),
  });
}

export async function updateListingForUser(id: string, userId: number, input: ListingEditInput) {
  const { env } = await import("cloudflare:workers");
  const current = await findListingForUser(id, userId);
  if (!current) return { error: "Anúncio não encontrado." } as const;
  const changed = listingEditSnapshot(current) !== listingEditSnapshot(input);
  if (!changed) return { listing: current, changed: false } as const;
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE portal_listings SET title=?, description=?, negotiation_type=?, category=?, subcategory=?,
    price_cents=?, monthly_rent_cents=?, iptu_cents=?, condo_cents=?, negotiable=?, address=?, latitude=?, longitude=?,
    display_name=?, whatsapp=?, attributes_json=?, features_json=?, images_json=?, cover_image=?, status='pending_review', updated_at=?
    WHERE id=? AND user_id=?`).bind(input.title.trim(), input.description.trim(), input.negotiationType, input.category, input.subcategory,
      input.priceCents, input.monthlyRentCents, input.iptuCents, input.condoCents, input.negotiable ? 1 : 0, input.address.trim(),
      input.latitude == null ? null : String(input.latitude), input.longitude == null ? null : String(input.longitude), input.displayName.trim(),
      input.whatsapp, JSON.stringify(input.attributes), JSON.stringify(input.features), JSON.stringify(input.images), input.images[0] || "/favicon.svg",
      now, id, userId).run();
  return { listing: await findListingForUser(id, userId), changed: true } as const;
}

export async function deleteListingForUser(id: string, userId: number) {
  const { env } = await import("cloudflare:workers"); await ensureListingTables();
  const current = await findListingForUser(id, userId); if (!current) return false;
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM portal_listings WHERE id=? AND user_id=?").bind(id, userId),
    env.DB.prepare("UPDATE portal_users SET active_ads=CASE WHEN active_ads > 0 THEN active_ads-1 ELSE 0 END, updated_at=? WHERE id=?").bind(now, userId),
  ]);
  return true;
}

export async function prepareListingHighlight(id: string, userId: number, planCode: string, amountCents: number, method: "PIX" | "CREDIT_CARD") {
  const { env } = await import("cloudflare:workers");
  const current = await findListingForUser(id, userId); if (!current) return null;
  await env.DB.prepare(`UPDATE portal_listings SET publication_type='featured', featured_plan=?, status='awaiting_payment',
    payment_provider='pagbank', payment_method=?, payment_amount_cents=?, payment_status='pending', updated_at=? WHERE id=? AND user_id=?`)
    .bind(planCode, method, amountCents, new Date().toISOString(), id, userId).run();
  return current;
}

export async function adminUpdateListing(id: string, input: { title: string; description: string; category: string; subcategory: string; negotiationType: string; address: string; priceCents: number | null; status?: string; images?: string[] }) {
  const { env } = await import("cloudflare:workers"); await ensureListingTables();
  const images = input.images?.filter(Boolean).slice(0, 12);
  await env.DB.prepare(`UPDATE portal_listings SET title=?, description=?, category=?, subcategory=?, negotiation_type=?, address=?, price_cents=?,
    images_json=COALESCE(?, images_json), cover_image=COALESCE(?, cover_image), status=COALESCE(?, status), updated_at=? WHERE id=?`)
    .bind(input.title.trim(), input.description.trim(), input.category, input.subcategory, input.negotiationType, input.address.trim(), input.priceCents,
      images ? JSON.stringify(images) : null, images?.[0] || null, input.status || null, new Date().toISOString(), id).run();
  return findStoredListingById(id, true);
}

export async function adminDeleteListing(id: string) {
  const { env } = await import("cloudflare:workers"); await ensureListingTables();
  const row = await findStoredListingById(id, true); if (!row) return false;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM portal_listings WHERE id=?").bind(id),
    env.DB.prepare("UPDATE portal_users SET active_ads=CASE WHEN active_ads > 0 THEN active_ads-1 ELSE 0 END, updated_at=? WHERE id=?").bind(new Date().toISOString(), row.userId),
  ]);
  return true;
}

export async function adminFeatureListing(id: string, superFeatured = false) {
  const { env } = await import("cloudflare:workers"); await ensureListingTables();
  const until = new Date(Date.now() + 30 * 86_400_000).toISOString();
  await env.DB.prepare(`UPDATE portal_listings SET publication_type=?, featured_plan=?, featured_until=?, expires_at=?,
    payment_status='paid', payment_amount_cents=0, status='active', updated_at=? WHERE id=?`)
    .bind(superFeatured ? "super_featured" : "featured", superFeatured ? "super" : "monthly", until, until, new Date().toISOString(), id).run();
  return findStoredListingById(id, true);
}

export async function adminApproveAllPendingListings() {
  const { env } = await import("cloudflare:workers"); await ensureListingTables();
  const now = new Date().toISOString();
  const result = await env.DB.prepare("UPDATE portal_listings SET status='active', updated_at=? WHERE status='pending_review'").bind(now).run();
  return Number(result.meta.changes || 0);
}

export async function findListingByPaymentReference(reference: string) {
  const { env } = await import("cloudflare:workers"); await ensureListingTables();
  return env.DB.prepare(`SELECT ${selectColumns()} FROM portal_listings WHERE payment_reference = ? LIMIT 1`).bind(reference).first<StoredListing>();
}

export async function confirmFeaturedPayment(reference: string) {
  const { env } = await import("cloudflare:workers"); await ensureListingTables();
  const listing = await findListingByPaymentReference(reference); if (!listing) return null;
  const duration = listing.featuredPlan === "semiannual" ? 180 : listing.featuredPlan === "quarterly" ? 90 : 30;
  const now = new Date(); const featuredUntil = new Date(now.getTime() + duration * 86_400_000).toISOString();
  await ensurePaymentTables();
  await env.DB.prepare("UPDATE portal_listings SET status = 'pending_review', payment_status = 'paid', featured_until = ?, expires_at = ?, updated_at = ? WHERE id = ?")
    .bind(featuredUntil, featuredUntil, now.toISOString(), listing.id).run();
  await updatePaymentByReference(reference, { status: "paid", providerStatus: "PAID", paidAt: now.toISOString() });
  await updateInvoiceStatusByListing(listing.id, "paid", listing.paymentMethod);
  return { ...listing, status: "pending_review", paymentStatus: "paid", featuredUntil, expiresAt: featuredUntil };
}

export async function cancelUnpaidListing(id: string, userId: number) {
  const { env } = await import("cloudflare:workers"); await ensureListingTables();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM portal_listings WHERE id = ? AND user_id = ? AND status = 'awaiting_payment'").bind(id, userId),
    env.DB.prepare("UPDATE portal_users SET active_ads = CASE WHEN active_ads > 0 THEN active_ads - 1 ELSE 0 END, updated_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), userId),
  ]);
}
