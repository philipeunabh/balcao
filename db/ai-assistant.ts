import { getPublicListings, type PublicListing } from "./public-listings";

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
function plain(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function searchTerms(query: string) {
  return [...new Set(plain(query).replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((term) => term.length >= 2 && !stopWords.has(term)))].slice(0, 6);
}

export async function searchAiChatListings(query: string, limit = 5): Promise<AiChatListingResult[]> {
  const terms = searchTerms(query);
  if (!terms.length) return [];
  const phrase = plain(query).trim();
  const listings = await getPublicListings();
  const score = (listing: PublicListing) => {
    const title = plain(listing.title);
    const category = plain(`${listing.category} ${listing.subcategory}`);
    const details = plain(`${listing.description} ${listing.locationLabel}`);
    let value = phrase.length >= 2 && title.includes(phrase) ? 80 : 0;
    for (const term of terms) {
      if (title === term) value += 40;
      else if (title.startsWith(term)) value += 24;
      else if (title.includes(term)) value += 16;
      if (category.includes(term)) value += 8;
      if (details.includes(term)) value += 3;
    }
    if (listing.publicationType === "super_featured" && listing.paymentStatus === "paid") value += 6;
    else if (listing.publicationType === "featured" && listing.paymentStatus === "paid") value += 4;
    else if (listing.storeListing) value += 2;
    return value;
  };
  const safeLimit = Math.min(10, Math.max(1, limit));
  return listings
    .map((listing) => ({ listing, score: score(listing) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || Date.parse(b.listing.createdAt || "") - Date.parse(a.listing.createdAt || ""))
    .slice(0, safeLimit)
    .map(({ listing }) => ({
      id: listing.id,
      title: listing.title,
      image: listing.coverImage || listing.images[0] || "/favicon.svg",
      priceLabel: listing.formattedPrice,
      location: listing.locationLabel,
      url: listing.url || `/anuncio/${encodeURIComponent(listing.id)}`,
      promotionLevel: listing.paymentStatus === "paid" && listing.publicationType === "super_featured"
        ? "super_featured"
        : listing.paymentStatus === "paid" && listing.publicationType === "featured"
          ? "featured"
          : listing.storeListing ? "store" : "free",
    }));
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
