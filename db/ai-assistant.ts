import { ensureStoreTables } from "./stores";

export type AiChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  body: string;
  intent: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AiChatListingResult = {
  id: string;
  title: string;
  image: string;
  priceLabel: string;
  location: string;
  url: string;
  promotionLevel?: "free" | "store" | "featured" | "super_featured";
};

let tablesReady: Promise<void> | null = null;

export async function ensureAiAssistantTables() {
  if (!tablesReady) {
    tablesReady = import("cloudflare:workers").then(async ({ env }) => {
      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS portal_ai_chat_sessions (
          id TEXT PRIMARY KEY NOT NULL, ip_address TEXT NOT NULL, user_agent TEXT NOT NULL DEFAULT '',
          customer_user_id INTEGER, status TEXT NOT NULL DEFAULT 'active', consent_at TEXT NOT NULL,
          last_message_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        )`),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS portal_ai_chat_sessions_last_message_idx ON portal_ai_chat_sessions (last_message_at)"),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS portal_ai_chat_sessions_customer_idx ON portal_ai_chat_sessions (customer_user_id, last_message_at)"),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS portal_ai_chat_messages (
          id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL, role TEXT NOT NULL, body TEXT NOT NULL,
          intent TEXT, metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
        )`),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS portal_ai_chat_messages_session_idx ON portal_ai_chat_messages (session_id, created_at)"),
      ]);
    }).then(() => undefined).catch((error) => { tablesReady = null; throw error; });
  }
  await tablesReady;
}

export function visitorIp(request: Request) {
  const value = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || "indisponível";
  return value.trim().replace(/[^0-9a-fA-F:.,]/g, "").slice(0, 64) || "indisponível";
}

export async function ensureAiChatSession(input: { id: string; ipAddress: string; userAgent: string; customerUserId?: number | null }) {
  const { env } = await import("cloudflare:workers");
  await ensureAiAssistantTables();
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO portal_ai_chat_sessions
      (id, ip_address, user_agent, customer_user_id, status, consent_at, last_message_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)`)
      .bind(input.id, input.ipAddress, input.userAgent.slice(0, 500), input.customerUserId || null, now, now, now, now),
    env.DB.prepare(`UPDATE portal_ai_chat_sessions SET ip_address=?, user_agent=?, customer_user_id=COALESCE(?, customer_user_id), updated_at=? WHERE id=?`)
      .bind(input.ipAddress, input.userAgent.slice(0, 500), input.customerUserId || null, now, input.id),
  ]);
  return input.id;
}

export async function aiChatSessionExists(id: string) {
  const { env } = await import("cloudflare:workers");
  await ensureAiAssistantTables();
  return Boolean(await env.DB.prepare("SELECT id FROM portal_ai_chat_sessions WHERE id=? LIMIT 1").bind(id).first());
}

export async function appendAiChatMessage(sessionId: string, role: AiChatMessage["role"], body: string, intent: string | null = null, metadata: Record<string, unknown> = {}) {
  const { env } = await import("cloudflare:workers");
  await ensureAiAssistantTables();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO portal_ai_chat_messages (id, session_id, role, body, intent, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, sessionId, role, body.slice(0, 4_000), intent, JSON.stringify(metadata).slice(0, 12_000), now),
    env.DB.prepare("UPDATE portal_ai_chat_sessions SET last_message_at=?, updated_at=? WHERE id=?").bind(now, now, sessionId),
  ]);
  return { id, role, body, intent, metadata, createdAt: now } satisfies AiChatMessage;
}

export async function listAiChatMessages(sessionId: string, limit = 100) {
  const { env } = await import("cloudflare:workers");
  await ensureAiAssistantTables();
  const rows = (await env.DB.prepare(`SELECT id, role, body, intent, metadata_json AS metadataJson, created_at AS createdAt
    FROM portal_ai_chat_messages WHERE session_id=? ORDER BY created_at ASC LIMIT ?`).bind(sessionId, Math.min(300, Math.max(1, limit))).all<{ id: string; role: AiChatMessage["role"]; body: string; intent: string | null; metadataJson: string; createdAt: string }>()).results;
  return rows.map((row) => ({ id: row.id, role: row.role, body: row.body, intent: row.intent, metadata: safeJson(row.metadataJson), createdAt: row.createdAt }));
}

function safeJson(value: string) {
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {}; }
  catch { return {}; }
}

const stopWords = new Set(["tem", "voce", "voces", "algum", "alguma", "quero", "procuro", "buscar", "busco", "preciso", "de", "do", "da", "um", "uma", "para", "por", "favor", "anuncio", "anuncios", "disponivel", "disponiveis"]);
function searchTerms(query: string) {
  return [...new Set(query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((term) => term.length >= 2 && !stopWords.has(term)))].slice(0, 4);
}

export async function searchAiChatListings(query: string, limit = 5): Promise<AiChatListingResult[]> {
  const { env } = await import("cloudflare:workers");
  await ensureStoreTables();
  const terms = searchTerms(query);
  if (!terms.length) return [];
  const conditions = terms.map(() => "(lower(title) LIKE ? OR lower(description) LIKE ? OR lower(category) LIKE ? OR lower(subcategory) LIKE ?)").join(" OR ");
  const bindings = terms.flatMap((term) => Array(4).fill(`%${term}%`));
  const rows = (await env.DB.prepare(`SELECT id, title, cover_image AS image, price_cents AS priceCents,
    monthly_rent_cents AS monthlyRentCents, negotiable, negotiation_type AS negotiationType, address, publication_type AS publicationType, payment_status AS paymentStatus
    FROM portal_listings WHERE status='active' AND (${conditions})
    ORDER BY CASE WHEN publication_type='super_featured' AND payment_status='paid' THEN 0 WHEN publication_type='featured' AND payment_status='paid' THEN 1 ELSE 3 END, created_at DESC LIMIT ?`)
    .bind(...bindings, Math.min(5, Math.max(1, limit))).all<{ id: string; title: string; image: string; priceCents: number | null; monthlyRentCents: number | null; negotiable: number; negotiationType: string; address: string; publicationType: string; paymentStatus: string | null }>()).results;
  const regular = rows.map((row) => {
    const cents = row.monthlyRentCents ?? row.priceCents;
    const priceLabel = row.negotiable || cents == null ? "Valor a combinar" : `${(cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}${row.negotiationType === "Aluguel" ? "/mês" : ""}`;
    const promotionLevel = row.paymentStatus === "paid" && row.publicationType === "super_featured" ? "super_featured" as const : row.paymentStatus === "paid" && row.publicationType === "featured" ? "featured" as const : "free" as const;
    return { id: row.id, title: row.title, image: row.image, priceLabel, location: row.address, url: `/anuncio/${encodeURIComponent(row.id)}`, promotionLevel };
  });
  const now = new Date().toISOString();
  const storeRows = (await env.DB.prepare(`SELECT l.id,l.title,l.cover_image AS image,l.price_cents AS priceCents,l.address,s.id AS storeId,s.slug AS storeSlug
    FROM portal_store_listings l JOIN portal_virtual_stores s ON s.id=l.store_id
    WHERE l.status='active' AND s.active=1 AND (s.plan_started_at IS NULL OR s.plan_started_at<=?) AND (s.plan_ends_at IS NULL OR s.plan_ends_at>=?)
      AND (${conditions.replaceAll("title","l.title").replaceAll("description","l.description").replaceAll("category","l.category").replaceAll("subcategory","l.subcategory")})
    ORDER BY l.created_at DESC LIMIT ?`).bind(now,now,...bindings,Math.min(5,Math.max(1,limit))).all<{ id:string; title:string; image:string; priceCents:number|null; address:string; storeId:string; storeSlug:string }>()).results;
  const store = storeRows.map((row) => ({ id:`store:${row.storeId}:${row.id}`,title:row.title,image:row.image,priceLabel:row.priceCents==null?"Valor a combinar":(row.priceCents/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}),location:row.address,url:`/loja/${encodeURIComponent(row.storeSlug)}/anuncio/${encodeURIComponent(row.id)}`,promotionLevel:"store" as const }));
  const rank=(item:AiChatListingResult)=>item.promotionLevel==="super_featured"?3:item.promotionLevel==="featured"?2:item.promotionLevel==="store"?1:0;
  return [...regular,...store].sort((a,b)=>rank(b)-rank(a)).slice(0,Math.min(5,Math.max(1,limit)));
}

export async function listAiChatSessions() {
  const { env } = await import("cloudflare:workers");
  await ensureAiAssistantTables();
  return (await env.DB.prepare(`SELECT s.id, s.ip_address AS ipAddress, s.user_agent AS userAgent,
    s.customer_user_id AS customerUserId, u.name AS customerName, u.email AS customerEmail, s.status,
    s.consent_at AS consentAt, s.last_message_at AS lastMessageAt, s.created_at AS createdAt,
    (SELECT COUNT(*) FROM portal_ai_chat_messages m WHERE m.session_id=s.id) AS messageCount,
    (SELECT body FROM portal_ai_chat_messages m WHERE m.session_id=s.id ORDER BY m.created_at DESC LIMIT 1) AS lastMessage
    FROM portal_ai_chat_sessions s LEFT JOIN portal_users u ON u.id=s.customer_user_id
    ORDER BY s.last_message_at DESC LIMIT 500`).all()).results;
}

export async function getAiChatSessionForAdmin(id: string) {
  const { env } = await import("cloudflare:workers");
  await ensureAiAssistantTables();
  const session = await env.DB.prepare(`SELECT s.id, s.ip_address AS ipAddress, s.user_agent AS userAgent,
    s.customer_user_id AS customerUserId, u.name AS customerName, u.email AS customerEmail,
    s.status, s.consent_at AS consentAt, s.last_message_at AS lastMessageAt, s.created_at AS createdAt
    FROM portal_ai_chat_sessions s LEFT JOIN portal_users u ON u.id=s.customer_user_id WHERE s.id=? LIMIT 1`).bind(id).first();
  if (!session) return null;
  return { session, messages: await listAiChatMessages(id, 300) };
}
