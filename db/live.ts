import { ensureStoreTables } from "./stores";

export type LiveSessionRecord = {
  id: string;
  storeId: string;
  userId: number;
  title: string;
  description: string;
  status: "live" | "ended";
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  storeName?: string;
  storeSlug?: string;
  storeLogo?: string | null;
};

export type LiveMessageRecord = {
  id: number;
  sessionId: string;
  senderKey: string;
  senderName: string;
  senderRole: "store" | "visitor";
  message: string;
  createdAt: string;
};

export type LiveSignalRecord = {
  id: number;
  sessionId: string;
  senderKey: string;
  recipientKey: string;
  kind: "offer" | "answer" | "ice";
  payload: string;
  createdAt: string;
};

export async function ensureLiveTables() {
  const { env } = await import("cloudflare:workers");
  await ensureStoreTables();
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS portal_live_sessions (
      id TEXT PRIMARY KEY NOT NULL, store_id TEXT NOT NULL, user_id INTEGER NOT NULL,
      title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'live',
      started_at TEXT NOT NULL, ended_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS portal_live_sessions_status_idx ON portal_live_sessions (status, started_at)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS portal_live_sessions_user_idx ON portal_live_sessions (user_id, status)"),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS portal_live_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, sender_key TEXT NOT NULL,
      sender_name TEXT NOT NULL, sender_role TEXT NOT NULL DEFAULT 'visitor', message TEXT NOT NULL, created_at TEXT NOT NULL
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS portal_live_messages_session_idx ON portal_live_messages (session_id, id)"),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS portal_live_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, sender_key TEXT NOT NULL,
      recipient_key TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS portal_live_signals_recipient_idx ON portal_live_signals (session_id, recipient_key, id)"),
  ]);
}

const sessionSelect = `SELECT s.id,s.store_id AS storeId,s.user_id AS userId,s.title,s.description,s.status,
  s.started_at AS startedAt,s.ended_at AS endedAt,s.created_at AS createdAt,s.updated_at AS updatedAt,
  v.name AS storeName,v.slug AS storeSlug,v.logo_url AS storeLogo FROM portal_live_sessions s
  JOIN portal_virtual_stores v ON v.id=s.store_id`;

export async function createLiveSession(userId: number, title: string, description: string) {
  const { env } = await import("cloudflare:workers");
  await ensureLiveTables();
  const now = new Date().toISOString();
  const store = await env.DB.prepare(`SELECT id FROM portal_virtual_stores WHERE user_id=? AND active=1
    AND (plan_started_at IS NULL OR plan_started_at<=?) AND (plan_ends_at IS NULL OR plan_ends_at>=?) LIMIT 1`)
    .bind(userId, now, now).first<{ id: string }>();
  if (!store) return null;
  await env.DB.prepare("UPDATE portal_live_sessions SET status='ended',ended_at=?,updated_at=? WHERE user_id=? AND status='live'")
    .bind(now, now, userId).run();
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO portal_live_sessions (id,store_id,user_id,title,description,status,started_at,created_at,updated_at)
    VALUES (?,?,?,?,?,'live',?,?,?)`).bind(id, store.id, userId, title, description, now, now, now).run();
  return getLiveSession(id);
}

export async function getActiveLiveSessionForUser(userId: number) {
  const { env } = await import("cloudflare:workers");
  await ensureLiveTables();
  return env.DB.prepare(`${sessionSelect} WHERE s.user_id=? AND s.status='live' ORDER BY s.started_at DESC LIMIT 1`)
    .bind(userId).first<LiveSessionRecord>();
}

export async function getLiveSession(id: string) {
  const { env } = await import("cloudflare:workers");
  await ensureLiveTables();
  return env.DB.prepare(`${sessionSelect} WHERE s.id=? LIMIT 1`).bind(id).first<LiveSessionRecord>();
}

export async function getPublicLiveSession(id: string) {
  const { env } = await import("cloudflare:workers");
  await ensureLiveTables();
  const activeSince = new Date(Date.now() - 90_000).toISOString();
  return env.DB.prepare(`${sessionSelect} WHERE s.id=? AND s.status='live' AND s.updated_at>=? LIMIT 1`)
    .bind(id, activeSince).first<LiveSessionRecord>();
}

export async function listActiveLiveSessions() {
  const { env } = await import("cloudflare:workers");
  await ensureLiveTables();
  const activeSince = new Date(Date.now() - 90_000).toISOString();
  return (await env.DB.prepare(`${sessionSelect} WHERE s.status='live' AND s.updated_at>=? ORDER BY s.started_at DESC LIMIT 30`).bind(activeSince).all<LiveSessionRecord>()).results;
}

export async function touchActiveLiveSession(userId: number) {
  const { env } = await import("cloudflare:workers");
  await ensureLiveTables();
  const now = new Date().toISOString();
  const result = await env.DB.prepare("UPDATE portal_live_sessions SET updated_at=? WHERE user_id=? AND status='live'")
    .bind(now, userId).run();
  return Number(result.meta.changes || 0) > 0;
}

export async function endLiveSession(id: string, userId: number) {
  const { env } = await import("cloudflare:workers");
  await ensureLiveTables();
  const now = new Date().toISOString();
  const result = await env.DB.prepare("UPDATE portal_live_sessions SET status='ended',ended_at=?,updated_at=? WHERE id=? AND user_id=? AND status='live'")
    .bind(now, now, id, userId).run();
  return Number(result.meta.changes || 0) > 0;
}

export async function isLiveSessionOwner(id: string, userId: number) {
  const session = await getLiveSession(id);
  return Boolean(session && session.userId === userId && session.status === "live");
}

export async function listLiveMessages(sessionId: string, after = 0) {
  const { env } = await import("cloudflare:workers");
  await ensureLiveTables();
  return (await env.DB.prepare(`SELECT id,session_id AS sessionId,sender_key AS senderKey,sender_name AS senderName,
    sender_role AS senderRole,message,created_at AS createdAt FROM portal_live_messages
    WHERE session_id=? AND id>? ORDER BY id ASC LIMIT 100`).bind(sessionId, after).all<LiveMessageRecord>()).results;
}

export async function createLiveMessage(input: { sessionId: string; senderKey: string; senderName: string; senderRole: "store" | "visitor"; message: string }) {
  const { env } = await import("cloudflare:workers");
  await ensureLiveTables();
  const recent = await env.DB.prepare("SELECT created_at AS createdAt FROM portal_live_messages WHERE session_id=? AND sender_key=? ORDER BY id DESC LIMIT 1")
    .bind(input.sessionId, input.senderKey).first<{ createdAt: string }>();
  if (recent && Date.now() - Date.parse(recent.createdAt) < 1200) return null;
  const now = new Date().toISOString();
  const result = await env.DB.prepare(`INSERT INTO portal_live_messages (session_id,sender_key,sender_name,sender_role,message,created_at)
    VALUES (?,?,?,?,?,?)`).bind(input.sessionId, input.senderKey, input.senderName, input.senderRole, input.message, now).run();
  return { id: Number(result.meta.last_row_id), ...input, createdAt: now } satisfies LiveMessageRecord;
}

export async function addLiveSignal(input: Omit<LiveSignalRecord, "id" | "createdAt">) {
  const { env } = await import("cloudflare:workers");
  await ensureLiveTables();
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO portal_live_signals (session_id,sender_key,recipient_key,kind,payload,created_at)
    VALUES (?,?,?,?,?,?)`).bind(input.sessionId, input.senderKey, input.recipientKey, input.kind, input.payload, now).run();
  await env.DB.prepare("DELETE FROM portal_live_signals WHERE created_at<?").bind(new Date(Date.now() - 15 * 60_000).toISOString()).run();
}

export async function listLiveSignals(sessionId: string, recipientKey: string, after = 0) {
  const { env } = await import("cloudflare:workers");
  await ensureLiveTables();
  return (await env.DB.prepare(`SELECT id,session_id AS sessionId,sender_key AS senderKey,recipient_key AS recipientKey,
    kind,payload,created_at AS createdAt FROM portal_live_signals WHERE session_id=? AND recipient_key=? AND id>? ORDER BY id ASC LIMIT 100`)
    .bind(sessionId, recipientKey, after).all<LiveSignalRecord>()).results;
}
