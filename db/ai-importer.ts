import type { AiImportedListingDraft } from "./openai";
import type { CustomerRecord } from "./customer-auth";
import { createListing, ensureListingTables } from "./listings";
import { ensureStoreTables, storePlanIsCurrent, type VirtualStoreRecord } from "./stores";

export type AiImportScope = "user" | "store";
export type AiImportSaveMode = "draft" | "publish";

function imageList(draft: AiImportedListingDraft) {
  const remote = draft.images.filter((item) => /^https:\/\//i.test(item)).slice(0, 12);
  return remote.length ? remote : ["/logo-balcao.webp"];
}

export async function saveUserAiImport(customer: CustomerRecord, draft: AiImportedListingDraft, mode: AiImportSaveMode) {
  const result = await createListing(customer, {
    title: draft.title,
    description: draft.description,
    negotiationType: draft.negotiationType,
    category: draft.category,
    subcategory: draft.subcategory,
    priceCents: draft.priceCents,
    monthlyRentCents: null,
    iptuCents: null,
    condoCents: null,
    negotiable: draft.priceCents == null,
    address: draft.address || "Localização não informada",
    latitude: null,
    longitude: null,
    displayName: customer.name,
    whatsapp: customer.whatsapp,
    attributes: { importadoPorIa: true, sourceUrl: draft.sourceUrl, externalUrl: draft.externalUrl, confidence: draft.confidence },
    features: draft.features,
    images: imageList(draft),
    publicationType: "free",
    featuredPlan: null,
    paymentMethod: null,
    paymentAmountCents: null,
  });
  if ("error" in result) return result;
  if (mode === "draft") {
    const { env } = await import("cloudflare:workers");
    await env.DB.prepare("UPDATE portal_listings SET status='draft', updated_at=? WHERE id=? AND user_id=?")
      .bind(new Date().toISOString(), result.id, customer.id).run();
  }
  return { id: result.id, status: mode === "draft" ? "draft" : result.status } as const;
}

export async function saveStoreAiImport(store: VirtualStoreRecord, draft: AiImportedListingDraft, mode: AiImportSaveMode) {
  const { env } = await import("cloudflare:workers");
  await ensureStoreTables();
  if (!storePlanIsCurrent(store)) return { error: "O plano da loja está inativo ou expirado." } as const;
  const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM portal_store_listings WHERE store_id=?")
    .bind(store.id).first<{ total: number }>();
  if (Number(count?.total || 0) >= store.adLimit) return { error: "O limite de anúncios da loja foi atingido." } as const;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const images = imageList(draft);
  await env.DB.prepare(`INSERT INTO portal_store_listings
    (id,store_id,title,description,category,subcategory,price_cents,address,cover_image,images_json,attributes_json,
     external_url,source,featured,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'ai_import',0,?,?,?)`)
    .bind(id, store.id, draft.title, draft.description, draft.category, draft.subcategory, draft.priceCents,
      draft.address || `${store.city} - ${store.state}`, images[0], JSON.stringify(images),
      JSON.stringify({ importadoPorIa: true, sourceUrl: draft.sourceUrl, confidence: draft.confidence }),
      draft.externalUrl, mode === "draft" ? "draft" : "active", now, now).run();
  return { id, status: mode === "draft" ? "draft" : "active" } as const;
}

export async function listUserAiDrafts(userId: number) {
  const { env } = await import("cloudflare:workers");
  await ensureListingTables();
  return (await env.DB.prepare(`SELECT id,title,description,category,subcategory,price_cents AS priceCents,address,
    images_json AS imagesJson,attributes_json AS attributesJson,status,created_at AS createdAt
    FROM portal_listings WHERE user_id=? AND status='draft' AND attributes_json LIKE '%"importadoPorIa":true%'
    ORDER BY created_at DESC LIMIT 50`).bind(userId).all<Record<string, unknown>>()).results;
}

export async function listStoreAiDrafts(storeId: string) {
  const { env } = await import("cloudflare:workers");
  await ensureStoreTables();
  return (await env.DB.prepare(`SELECT id,title,description,category,subcategory,price_cents AS priceCents,address,
    images_json AS imagesJson,attributes_json AS attributesJson,external_url AS externalUrl,status,created_at AS createdAt
    FROM portal_store_listings WHERE store_id=? AND source='ai_import' AND status='draft'
    ORDER BY created_at DESC LIMIT 50`).bind(storeId).all<Record<string, unknown>>()).results;
}
