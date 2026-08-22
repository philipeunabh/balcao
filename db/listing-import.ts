import type { PortalCategory } from "../app/categories";
import { mapCategory } from "../app/categories";
import { ensureImportCustomer, IMPORT_ACCOUNT_EMAIL } from "./customer-auth";
import { ensureListingTables } from "./listings";
import { writePortalSettings } from "./settings";

type UnknownRecord = Record<string, unknown>;
const IMPORT_SOURCE = "kimi-jornalbalcao";
const DEFAULT_SOURCE_URL = "https://ow7hfhirtmiiw.kimi.page/data/api.json";

type ImportRecord = {
  id: string; externalId: string; externalSlug: string; externalUrl: string; source: string; sourceStatus: string;
  title: string; description: string; category: string; subcategory: string; priceCents: number | null;
  negotiable: boolean; images: string[]; displayName: string; whatsapp: string; publishedAt: string; updatedAt: string;
};

function text(value: unknown) { return typeof value === "string" ? value.trim() : value == null ? "" : String(value); }
function first(source: UnknownRecord, keys: string[]) { for (const key of keys) if (source[key] != null && source[key] !== "") return source[key]; }
function slug(value: string, index: number) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || `anuncio-${index + 1}`; }
function imageUrls(source: UnknownRecord) {
  const list = first(source, ["images", "imagens", "fotos", "photos"]);
  return [first(source, ["image", "imagem", "coverImage", "foto", "thumbnail", "capa"]), ...(Array.isArray(list) ? list : [])]
    .map((value) => typeof value === "object" && value ? text(first(value as UnknownRecord, ["url", "src", "image"])) : text(value))
    .filter((value, index, values) => /^https?:\/\//i.test(value) && values.indexOf(value) === index).slice(0, 12);
}
function priceCents(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value * 100));
  const raw = text(value).replace(/[^\d,.-]/g, ""); if (!raw) return null;
  const decimal = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number(decimal); return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : null;
}
function normalize(source: UnknownRecord, index: number): ImportRecord | null {
  const title = text(first(source, ["title", "titulo", "name", "nome"])); if (!title) return null;
  const rawId = text(first(source, ["id", "_id", "codigo", "code", "slug", "url_slug"]));
  const externalSlug = text(first(source, ["slug", "url_slug"])) || slug(title, index);
  const seller = first(source, ["seller", "vendedor"]); const sellerRecord = seller && typeof seller === "object" ? seller as UnknownRecord : {};
  const categories = first(source, ["categorias", "categories"]);
  const categoryNames = Array.isArray(categories) ? categories.map(text).filter(Boolean) : [];
  const price = priceCents(first(source, ["price", "preco", "valor", "value"]));
  const phones = first(source, ["telefones", "phones"]);
  const phone = Array.isArray(phones) ? phones.map(text).find(Boolean) : first(source, ["whatsapp", "phone", "telefone"]);
  const sourceStatus = text(first(source, ["status", "post_status"])).toLowerCase() || "publish";
  const externalId = rawId || externalSlug;
  return {
    id: `${IMPORT_SOURCE}-${slug(externalId, index)}`,
    externalId,
    externalSlug,
    externalUrl: text(first(source, ["link", "url", "permalink"])),
    source: IMPORT_SOURCE,
    sourceStatus,
    title: title.slice(0, 120),
    description: text(first(source, ["description", "descricao", "content", "conteudo"])).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 5000) || `Anúncio importado: ${title}`,
    category: mapCategory(categoryNames[0] || text(first(source, ["category", "categoria", "categoryName"])), title),
    subcategory: categoryNames.at(-1) || text(first(source, ["subcategory", "subcategoria", "subCategory", "categoryChild"])),
    priceCents: price,
    negotiable: price == null || price === 0,
    images: imageUrls(source),
    displayName: text(first(sellerRecord, ["name", "nome"])) || text(first(source, ["anunciante", "sellerName", "nomeVendedor"])) || "Importação de anúncios",
    whatsapp: text(first(sellerRecord, ["whatsapp", "phone", "telefone"]) || phone).replace(/\D/g, "").slice(-13) || "31000000000",
    publishedAt: text(first(source, ["data_publicacao", "published_at", "publishedAt"])),
    updatedAt: text(first(source, ["data_atualizacao", "updated_at", "updatedAt"])),
  };
}
function validateSourceUrl(value: string) {
  const url = new URL(value); if (!/^https?:$/.test(url.protocol)) throw new Error("Use um endereço HTTP ou HTTPS.");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local") || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname)) throw new Error("O endereço de importação não pode apontar para uma rede privada.");
  return url.toString();
}

function plain(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

/**
 * Classificação local e determinística. Ela é deliberadamente rápida: não faz
 * chamadas externas e permite processar milhares de anúncios em poucos lotes.
 */
function classifyLocally(record: ImportRecord, categories: Pick<PortalCategory, "name" | "subs">[]) {
  const source = plain(`${record.category} ${record.subcategory} ${record.title} ${record.description}`);
  const category = mapCategory(record.category, `${record.title} ${record.description}`);
  const configured = categories.find((item) => plain(item.name) === plain(category));
  const direct = configured?.subs.find((item) => source.includes(plain(item)));
  if (direct) return { category, subcategory: direct };

  const rules: Record<string, Array<[RegExp, string]>> = {
    "Veículos": [
      [/\bmoto|motocic|scooter|biz|cg\b/i, "Motos"],
      [/caminh|carreta|truck/i, "Caminhões"],
      [/onibus|ônibus/i, "Ônibus"],
      [/barco|lancha|aeronave|aviao|avião/i, "Barcos e aeronaves"],
      [/./, "Carros, vans e utilitários"],
    ],
    "Imóveis": [
      [/alug|locaç|locacao/i, "Aluguel — casas e apartamentos"],
      [/temporada|diaria|diária/i, "Temporada"],
      [/terreno|lote|sitio|sítio|fazenda|chacara|chácara/i, "Terrenos, sítios e fazendas"],
      [/loja|galpao|galpão|sala comercial|industrial/i, "Comércio e indústria"],
      [/lançamento|lancamento|novo/i, "Imóvel novo"],
      [/./, "Venda — casas e apartamentos"],
    ],
    "Empregos": [[/tecnologia|program|desenvolv|suporte|ti\b/i, "Tecnologia"], [/venda|comercial/i, "Comercial e vendas"], [/saude|saúde|enferm|medic/i, "Saúde"]],
  };
  const match = rules[category]?.find(([pattern]) => pattern.test(source))?.[1];
  return { category, subcategory: match || record.subcategory || configured?.subs[0] || "Outros" };
}

async function ensureTables() {
  const { env } = await import("cloudflare:workers"); await ensureListingTables();
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS portal_import_jobs (id TEXT PRIMARY KEY NOT NULL, source_url TEXT NOT NULL,
      status TEXT NOT NULL, total INTEGER NOT NULL DEFAULT 0, processed INTEGER NOT NULL DEFAULT 0, imported INTEGER NOT NULL DEFAULT 0,
      updated INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS portal_import_queue (job_id TEXT NOT NULL, listing_id TEXT NOT NULL, position INTEGER NOT NULL,
      payload_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', PRIMARY KEY (job_id, listing_id))`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS portal_import_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL,
      listing_id TEXT NOT NULL, title TEXT NOT NULL, category TEXT, subcategory TEXT, status TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL)`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS portal_import_queue_status_idx ON portal_import_queue (job_id, status, position)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS portal_import_logs_job_idx ON portal_import_logs (job_id, id DESC)"),
  ]);
  const columns = await env.DB.prepare("PRAGMA table_info(portal_import_jobs)").all<{ name: string }>();
  if (!columns.results.some((column) => column.name === "deactivated")) {
    await env.DB.prepare("ALTER TABLE portal_import_jobs ADD COLUMN deactivated INTEGER NOT NULL DEFAULT 0").run();
  }
}

export async function startListingImport(sourceUrl = DEFAULT_SOURCE_URL) {
  const url = validateSourceUrl(sourceUrl.trim() || DEFAULT_SOURCE_URL); await ensureTables();
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 30_000);
  let response: Response;
  try { response = await fetch(url, { signal: controller.signal, headers: { accept: "application/json", "user-agent": "Portal Balcao/1.0" } }); }
  finally { clearTimeout(timeout); }
  if (!response.ok) throw new Error(`O endereço de importação respondeu com HTTP ${response.status}.`);
  const json: unknown = await response.json().catch(() => { throw new Error("O endereço não retornou um JSON válido."); });
  const root = json && typeof json === "object" ? json as UnknownRecord : {};
  const collection = Array.isArray(json) ? json : first(root, ["listings", "anuncios", "ads", "items", "data"]);
  if (!Array.isArray(collection)) throw new Error("O JSON não contém uma lista de anúncios reconhecida.");
  const normalized = collection.slice(0, 3000).flatMap((item, index) => item && typeof item === "object" ? [normalize(item as UnknownRecord, index)].filter((record): record is ImportRecord => Boolean(record)) : []);
  const records = [...new Map(normalized.filter((record) => record.sourceStatus === "publish").map((record) => [record.id, record])).values()];
  if (!records.length) throw new Error("Nenhum anúncio válido foi encontrado no JSON.");
  const userId = await ensureImportCustomer(); await writePortalSettings({ listing_import_url: url });
  const { env } = await import("cloudflare:workers"); const id = crypto.randomUUID(); const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO portal_import_jobs (id, source_url, status, total, created_at, updated_at) VALUES (?, ?, 'running', ?, ?, ?)").bind(id, url, records.length, now, now).run();
  for (let offset = 0; offset < records.length; offset += 40) {
    await env.DB.batch(records.slice(offset, offset + 40).map((record, index) => env.DB.prepare(`INSERT INTO portal_import_queue
      (job_id, listing_id, position, payload_json, status) VALUES (?, ?, ?, ?, 'pending')`)
      .bind(id, record.id, offset + index, JSON.stringify({ ...record, userId }))));
  }
  return getListingImport(id);
}

async function completeListingImport(jobId: string) {
  const { env } = await import("cloudflare:workers");
  const job = await env.DB.prepare("SELECT status FROM portal_import_jobs WHERE id = ? LIMIT 1").bind(jobId).first<{ status: string }>();
  if (!job || job.status !== "running") return;
  const userId = await ensureImportCustomer();
  const sourceMarker = `\"importSource\":\"${IMPORT_SOURCE}\"`;
  const missing = await env.DB.prepare(`SELECT COUNT(*) AS total FROM portal_listings l
    WHERE l.user_id = ? AND l.status = 'active' AND l.attributes_json LIKE ?
      AND NOT EXISTS (SELECT 1 FROM portal_import_queue q WHERE q.job_id = ? AND q.listing_id = l.id)`)
    .bind(userId, `%${sourceMarker}%`, jobId).first<{ total: number }>();
  const deactivated = Number(missing?.total || 0);
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`UPDATE portal_listings SET status = 'inactive', updated_at = ?
      WHERE user_id = ? AND status = 'active' AND attributes_json LIKE ?
        AND NOT EXISTS (SELECT 1 FROM portal_import_queue q WHERE q.job_id = ? AND q.listing_id = portal_listings.id)`)
      .bind(now, userId, `%${sourceMarker}%`, jobId),
    env.DB.prepare("UPDATE portal_import_jobs SET status = 'completed', deactivated = ?, updated_at = ? WHERE id = ? AND status = 'running'")
      .bind(deactivated, now, jobId),
    env.DB.prepare("UPDATE portal_users SET active_ads = (SELECT COUNT(*) FROM portal_listings WHERE user_id = ? AND status = 'active'), updated_at = ? WHERE id = ?")
      .bind(userId, now, userId),
  ]);
}

export async function processNextListingImport(jobId: string, categories: Pick<PortalCategory, "name" | "subs">[]) {
  await ensureTables(); const { env } = await import("cloudflare:workers");
  const row = await env.DB.prepare("SELECT listing_id AS listingId, payload_json AS payloadJson FROM portal_import_queue WHERE job_id = ? AND status = 'pending' ORDER BY position LIMIT 1")
    .bind(jobId).first<{ listingId: string; payloadJson: string }>();
  if (!row) { await completeListingImport(jobId); return getListingImport(jobId); }
  await env.DB.prepare("UPDATE portal_import_queue SET status = 'processing' WHERE job_id = ? AND listing_id = ?").bind(jobId, row.listingId).run();
  const record = JSON.parse(row.payloadJson) as ImportRecord & { userId: number }; const now = new Date().toISOString();
  try {
    const classification = classifyLocally(record, categories);
    const location = { label: "Belo Horizonte, MG", latitude: -19.9166813, longitude: -43.9344931 };
    // As URLs originais deixam o anúncio visível imediatamente. A otimização das
    // imagens pode ser executada depois, sem bloquear a publicação do catálogo.
    const images = record.images;
    const existing = await env.DB.prepare("SELECT id FROM portal_listings WHERE id = ? LIMIT 1").bind(record.id).first();
    const attributes = JSON.stringify({
      importSource: record.source,
      externalId: record.externalId,
      externalSlug: record.externalSlug,
      externalUrl: record.externalUrl,
      sourceStatus: record.sourceStatus,
      sourcePublishedAt: record.publishedAt,
      sourceUpdatedAt: record.updatedAt,
    });
    await env.DB.prepare(`INSERT INTO portal_listings (id, user_id, title, description, negotiation_type, category, subcategory,
      price_cents, monthly_rent_cents, iptu_cents, condo_cents, negotiable, address, latitude, longitude, display_name, whatsapp,
      attributes_json, features_json, images_json, cover_image, publication_type, featured_plan, featured_until, expires_at, status,
      payment_provider, payment_reference, payment_method, payment_amount_cents, payment_expires_at, payment_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'Venda', ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, 'free', NULL, NULL, NULL,
        'active', NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)
      ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id, title=excluded.title, description=excluded.description,
        category=excluded.category, subcategory=excluded.subcategory, price_cents=excluded.price_cents, negotiable=excluded.negotiable,
        address=excluded.address, latitude=excluded.latitude, longitude=excluded.longitude, display_name=excluded.display_name,
        whatsapp=excluded.whatsapp, attributes_json=excluded.attributes_json, images_json=excluded.images_json,
        cover_image=excluded.cover_image, status='active', updated_at=excluded.updated_at`)
      .bind(record.id, record.userId, record.title, record.description, classification.category, classification.subcategory,
        record.priceCents, record.negotiable ? 1 : 0, location.label, String(location.latitude), String(location.longitude),
        record.displayName, record.whatsapp, attributes, JSON.stringify(images), images[0] || "/favicon.svg", now, now).run();
    await env.DB.batch([
      env.DB.prepare("UPDATE portal_import_queue SET status = 'completed' WHERE job_id = ? AND listing_id = ?").bind(jobId, row.listingId),
      env.DB.prepare(`INSERT INTO portal_import_logs (job_id, listing_id, title, category, subcategory, status, message, created_at)
        VALUES (?, ?, ?, ?, ?, 'completed', ?, ?)`).bind(jobId, row.listingId, record.title, classification.category, classification.subcategory, `${existing ? "Atualizado" : "Importado"} · ${images.length} foto(s) · classificação local`, now),
      env.DB.prepare(`UPDATE portal_import_jobs SET processed=processed+1, ${existing ? "updated=updated+1" : "imported=imported+1"}, updated_at=? WHERE id=?`).bind(now, jobId),
      env.DB.prepare("UPDATE portal_users SET active_ads = (SELECT COUNT(*) FROM portal_listings WHERE user_id = ?), updated_at = ? WHERE id = ?").bind(record.userId, now, record.userId),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "Falha desconhecida";
    await env.DB.batch([
      env.DB.prepare("UPDATE portal_import_queue SET status = 'failed' WHERE job_id = ? AND listing_id = ?").bind(jobId, row.listingId),
      env.DB.prepare("INSERT INTO portal_import_logs (job_id, listing_id, title, status, message, created_at) VALUES (?, ?, ?, 'failed', ?, ?)").bind(jobId, row.listingId, record.title, message, now),
      env.DB.prepare("UPDATE portal_import_jobs SET processed=processed+1, failed=failed+1, updated_at=? WHERE id=?").bind(now, jobId),
    ]);
  }
  const pending = await env.DB.prepare("SELECT 1 FROM portal_import_queue WHERE job_id = ? AND status = 'pending' LIMIT 1").bind(jobId).first();
  if (!pending) await completeListingImport(jobId);
  return getListingImport(jobId);
}

export async function processListingImportBatch(jobId: string, categories: Pick<PortalCategory, "name" | "subs">[], limit = 50) {
  let state = await getListingImport(jobId);
  for (let index = 0; index < limit && state.job && state.job.status === "running"; index += 1) {
    state = await processNextListingImport(jobId, categories);
  }
  return state;
}

export async function getListingImport(id?: string) {
  await ensureTables(); const { env } = await import("cloudflare:workers");
  const job = id ? await env.DB.prepare("SELECT id, source_url AS sourceUrl, status, total, processed, imported, updated, deactivated, failed, created_at AS createdAt, updated_at AS updatedAt FROM portal_import_jobs WHERE id=?").bind(id).first()
    : await env.DB.prepare("SELECT id, source_url AS sourceUrl, status, total, processed, imported, updated, deactivated, failed, created_at AS createdAt, updated_at AS updatedAt FROM portal_import_jobs ORDER BY created_at DESC LIMIT 1").first();
  const logs = job ? (await env.DB.prepare("SELECT listing_id AS listingId, title, category, subcategory, status, message, created_at AS createdAt FROM portal_import_logs WHERE job_id=? ORDER BY id DESC LIMIT 200").bind(String(job.id)).all()).results : [];
  return { job: job || null, logs, importUserEmail: IMPORT_ACCOUNT_EMAIL };
}
