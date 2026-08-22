import type { PortalCategory } from "../app/categories";
import { classifyListingWithOpenAI } from "./openai";
import { listStoredListings, type StoredListing } from "./listings";
import { readPortalSettings } from "./settings";

const API_URL = process.env.LISTINGS_API_URL ?? "https://ow7hfhirtmiiw.kimi.page/data/api.json";
type Candidate = { id: string; source: "stored" | "imported"; title: string; description: string; category: string; subcategory: string };
type UnknownRecord = Record<string, unknown>;

async function ensureAiReviewTables() {
  const { env } = await import("cloudflare:workers");
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS portal_ai_review_jobs (
      id TEXT PRIMARY KEY NOT NULL, status TEXT NOT NULL, total INTEGER NOT NULL DEFAULT 0,
      processed INTEGER NOT NULL DEFAULT 0, changed INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS portal_ai_review_queue (
      job_id TEXT NOT NULL, listing_id TEXT NOT NULL, source TEXT NOT NULL, position INTEGER NOT NULL,
      title TEXT NOT NULL, description TEXT NOT NULL, current_category TEXT NOT NULL, current_subcategory TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', PRIMARY KEY (job_id, listing_id)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS portal_ai_review_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL, listing_id TEXT NOT NULL, title TEXT NOT NULL,
      old_category TEXT NOT NULL, old_subcategory TEXT NOT NULL, new_category TEXT, new_subcategory TEXT,
      status TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS portal_listing_ai_overrides (
      listing_id TEXT PRIMARY KEY NOT NULL, category TEXT NOT NULL, subcategory TEXT NOT NULL,
      confidence INTEGER NOT NULL, reason TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS portal_ai_review_queue_status_idx ON portal_ai_review_queue (job_id, status, position)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS portal_ai_review_logs_job_idx ON portal_ai_review_logs (job_id, id DESC)"),
  ]);
}

function stringValue(value: unknown) { return typeof value === "string" ? value.trim() : value == null ? "" : String(value); }
function first(source: UnknownRecord, keys: string[]) { for (const key of keys) if (source[key] != null && source[key] !== "") return source[key]; }

async function importedCandidates(): Promise<Candidate[]> {
  const settings = await readPortalSettings();
  const sourceUrl = typeof settings.listing_import_url === "string" && /^https?:\/\//.test(settings.listing_import_url) ? settings.listing_import_url : API_URL;
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(sourceUrl, { signal: controller.signal, headers: { accept: "application/json" } });
    if (!response.ok) return [];
    const json: unknown = await response.json(); const root = typeof json === "object" && json ? json as UnknownRecord : {};
    const records = Array.isArray(json) ? json : first(root, ["listings", "anuncios", "ads", "items", "data"]);
    return (Array.isArray(records) ? records : []).flatMap((item, index) => {
      if (!item || typeof item !== "object") return [];
      const source = item as UnknownRecord; const title = stringValue(first(source, ["title", "titulo", "name", "nome"]));
      if (!title) return [];
      const rawId = stringValue(first(source, ["slug", "url_slug", "id", "_id", "codigo", "code"]));
      const id = rawId || `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${index}`;
      return [{ id, source: "imported" as const, title, description: stringValue(first(source, ["description", "descricao", "content", "conteudo"])).replace(/<[^>]+>/g, ""), category: stringValue(first(source, ["category", "categoria", "categoryName"])), subcategory: stringValue(first(source, ["subcategory", "subcategoria", "subCategory", "categoryChild"])) }];
    });
  } catch { return []; } finally { clearTimeout(timeout); }
}

async function allCandidates() {
  const [stored, imported] = await Promise.all([listStoredListings(true), importedCandidates()]);
  const storedCandidates: Candidate[] = stored.map((item: StoredListing) => ({ id: item.id, source: "stored", title: item.title, description: item.description, category: item.category, subcategory: item.subcategory }));
  return [...new Map([...imported, ...storedCandidates].map((item) => [item.id, item])).values()];
}

export async function startAiReviewJob() {
  const { env } = await import("cloudflare:workers"); await ensureAiReviewTables();
  const candidates = await allCandidates(); const id = crypto.randomUUID(); const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO portal_ai_review_jobs (id, status, total, created_at, updated_at) VALUES (?, 'running', ?, ?, ?)").bind(id, candidates.length, now, now).run();
  for (let offset = 0; offset < candidates.length; offset += 60) {
    await env.DB.batch(candidates.slice(offset, offset + 60).map((item, index) => env.DB.prepare(`INSERT INTO portal_ai_review_queue
      (job_id, listing_id, source, position, title, description, current_category, current_subcategory, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`).bind(id, item.id, item.source, offset + index, item.title, item.description, item.category, item.subcategory)));
  }
  if (!candidates.length) await env.DB.prepare("UPDATE portal_ai_review_jobs SET status = 'completed', updated_at = ? WHERE id = ?").bind(now, id).run();
  return getAiReviewJob(id);
}

export async function processNextAiReviewItem(jobId: string, categories: Pick<PortalCategory, "name" | "subs">[]) {
  const { env } = await import("cloudflare:workers"); await ensureAiReviewTables();
  const item = await env.DB.prepare(`SELECT listing_id AS listingId, source, title, description, current_category AS currentCategory,
    current_subcategory AS currentSubcategory FROM portal_ai_review_queue WHERE job_id = ? AND status = 'pending' ORDER BY position LIMIT 1`)
    .bind(jobId).first<{ listingId: string; source: string; title: string; description: string; currentCategory: string; currentSubcategory: string }>();
  if (!item) {
    await env.DB.prepare("UPDATE portal_ai_review_jobs SET status = 'completed', updated_at = ? WHERE id = ? AND status = 'running'").bind(new Date().toISOString(), jobId).run();
    return getAiReviewJob(jobId);
  }
  await env.DB.prepare("UPDATE portal_ai_review_queue SET status = 'processing' WHERE job_id = ? AND listing_id = ? AND status = 'pending'").bind(jobId, item.listingId).run();
  const now = new Date().toISOString();
  try {
    const result = await classifyListingWithOpenAI({ title: item.title, description: item.description, currentCategory: item.currentCategory, currentSubcategory: item.currentSubcategory, categories });
    const changed = result.category !== item.currentCategory || result.subcategory !== item.currentSubcategory;
    const statements = [
      env.DB.prepare(`INSERT INTO portal_listing_ai_overrides (listing_id, category, subcategory, confidence, reason, updated_at)
        VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(listing_id) DO UPDATE SET category = excluded.category, subcategory = excluded.subcategory,
        confidence = excluded.confidence, reason = excluded.reason, updated_at = excluded.updated_at`).bind(item.listingId, result.category, result.subcategory, result.confidence, result.reason, now),
      env.DB.prepare("UPDATE portal_ai_review_queue SET status = 'completed' WHERE job_id = ? AND listing_id = ?").bind(jobId, item.listingId),
      env.DB.prepare(`INSERT INTO portal_ai_review_logs (job_id, listing_id, title, old_category, old_subcategory, new_category, new_subcategory, status, message, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?)`).bind(jobId, item.listingId, item.title, item.currentCategory, item.currentSubcategory, result.category, result.subcategory, `${result.confidence}% — ${result.reason}`, now),
      env.DB.prepare("UPDATE portal_ai_review_jobs SET processed = processed + 1, changed = changed + ?, updated_at = ? WHERE id = ?").bind(changed ? 1 : 0, now, jobId),
    ];
    if (item.source === "stored") statements.push(env.DB.prepare("UPDATE portal_listings SET category = ?, subcategory = ?, updated_at = ? WHERE id = ?").bind(result.category, result.subcategory, now, item.listingId));
    await env.DB.batch(statements);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "Falha desconhecida";
    await env.DB.batch([
      env.DB.prepare("UPDATE portal_ai_review_queue SET status = 'failed' WHERE job_id = ? AND listing_id = ?").bind(jobId, item.listingId),
      env.DB.prepare(`INSERT INTO portal_ai_review_logs (job_id, listing_id, title, old_category, old_subcategory, status, message, created_at)
        VALUES (?, ?, ?, ?, ?, 'failed', ?, ?)`).bind(jobId, item.listingId, item.title, item.currentCategory, item.currentSubcategory, message, now),
      env.DB.prepare("UPDATE portal_ai_review_jobs SET processed = processed + 1, failed = failed + 1, updated_at = ? WHERE id = ?").bind(now, jobId),
    ]);
  }
  const pending = await env.DB.prepare("SELECT 1 AS pending FROM portal_ai_review_queue WHERE job_id = ? AND status = 'pending' LIMIT 1").bind(jobId).first();
  if (!pending) await env.DB.prepare("UPDATE portal_ai_review_jobs SET status = 'completed', updated_at = ? WHERE id = ?").bind(new Date().toISOString(), jobId).run();
  return getAiReviewJob(jobId);
}

export async function getAiReviewJob(id?: string) {
  const { env } = await import("cloudflare:workers"); await ensureAiReviewTables();
  const job = id
    ? await env.DB.prepare("SELECT id, status, total, processed, changed, failed, created_at AS createdAt, updated_at AS updatedAt FROM portal_ai_review_jobs WHERE id = ?").bind(id).first()
    : await env.DB.prepare("SELECT id, status, total, processed, changed, failed, created_at AS createdAt, updated_at AS updatedAt FROM portal_ai_review_jobs ORDER BY created_at DESC LIMIT 1").first();
  if (!job) return { job: null, logs: [] };
  const logs = (await env.DB.prepare(`SELECT listing_id AS listingId, title, old_category AS oldCategory, old_subcategory AS oldSubcategory,
    new_category AS newCategory, new_subcategory AS newSubcategory, status, message, created_at AS createdAt
    FROM portal_ai_review_logs WHERE job_id = ? ORDER BY id DESC LIMIT 200`).bind(String(job.id)).all()).results;
  return { job, logs };
}

export async function readListingAiOverrides(ids: string[]) {
  const { env } = await import("cloudflare:workers"); await ensureAiReviewTables();
  const result = new Map<string, { category: string; subcategory: string }>();
  for (let offset = 0; offset < ids.length; offset += 80) {
    const slice = ids.slice(offset, offset + 80); if (!slice.length) continue;
    const rows = (await env.DB.prepare(`SELECT listing_id AS listingId, category, subcategory FROM portal_listing_ai_overrides WHERE listing_id IN (${slice.map(() => "?").join(",")})`).bind(...slice).all<{ listingId: string; category: string; subcategory: string }>()).results;
    rows.forEach((row: { listingId: string; category: string; subcategory: string }) => result.set(row.listingId, { category: row.category, subcategory: row.subcategory }));
  }
  return result;
}
