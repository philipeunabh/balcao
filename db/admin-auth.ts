const PBKDF2_ITERATIONS = 100_000;

export const ADMIN_SESSION_COOKIE = "balcao_admin_session";

type AdminRecord = {
  id: number;
  email: string;
  role: string;
  status: string;
};

function bytesToBase64(bytes: Uint8Array) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}

function base64ToBytes(value: string) {
  const decoded = atob(value);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function secureEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

async function derivePassword(password: string, salt: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: base64ToBytes(salt),
      iterations: PBKDF2_ITERATIONS,
    },
    key,
    256,
  );
  return new Uint8Array(bits);
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return bytesToBase64(new Uint8Array(digest));
}

function bootstrapAdminEmail() {
  return process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() || "";
}

function bootstrapCommercialAccounts() {
  const source = process.env.BOOTSTRAP_COMMERCIAL_ACCOUNTS_JSON?.trim();
  if (!source) return [] as Array<{ email: string; password: string }>;
  try {
    const parsed = JSON.parse(source) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      const email = String(record.email || "").trim().toLowerCase();
      const password = String(record.password || "");
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && password.length >= 12
        ? [{ email, password }]
        : [];
    });
  } catch {
    return [];
  }
}

async function insertBootstrapAccount(database: D1Database, email: string, password: string, role: "admin" | "commercial", now: string) {
  const salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
  const passwordHash = bytesToBase64(await derivePassword(password, salt));
  await database.prepare(
    `INSERT INTO portal_admins
     (email, password_salt, password_hash, role, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?)
     ON CONFLICT(email) DO NOTHING`,
  ).bind(email, salt, passwordHash, role, now, now).run();
}

export async function ensureAdminTables() {
  const { env } = await import("cloudflare:workers");
  const database = env.DB;
  await database.batch([
    database.prepare(`CREATE TABLE IF NOT EXISTS portal_admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS portal_admin_sessions (
      token_hash TEXT PRIMARY KEY NOT NULL,
      admin_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS portal_admin_login_attempts (
      key TEXT PRIMARY KEY NOT NULL,
      failures INTEGER NOT NULL DEFAULT 0,
      last_attempt_at TEXT NOT NULL,
      blocked_until TEXT
    )`),
    database.prepare(
      "CREATE INDEX IF NOT EXISTS portal_admin_sessions_admin_id_idx ON portal_admin_sessions (admin_id)",
    ),
  ]);
  const now = new Date().toISOString();
  const count = await database.prepare("SELECT COUNT(*) AS total FROM portal_admins").first<{ total: number }>();
  if (Number(count?.total || 0) === 0) {
    const adminEmail = bootstrapAdminEmail();
    const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD || "";
    if (adminEmail && adminPassword.length >= 12) {
      await insertBootstrapAccount(database, adminEmail, adminPassword, "admin", now);
    }
    for (const account of bootstrapCommercialAccounts()) {
      await insertBootstrapAccount(database, account.email, account.password, "commercial", now);
    }
  }
}

async function authenticateStaff(email: string, password: string, role: "admin" | "commercial") {
  const { env } = await import("cloudflare:workers");
  await ensureAdminTables();
  const row = await env.DB
    .prepare(
      `SELECT id, email, password_salt AS passwordSalt,
       password_hash AS passwordHash, role, status
       FROM portal_admins WHERE lower(email) = lower(?) LIMIT 1`,
    )
    .bind(email.trim())
    .first<AdminRecord & { passwordSalt: string; passwordHash: string }>();
  if (!row || row.status !== "active" || row.role !== role) return null;
  const derived = await derivePassword(password, row.passwordSalt);
  if (!secureEqual(derived, base64ToBytes(row.passwordHash))) return null;
  return { id: row.id, email: row.email, role: row.role, status: row.status };
}

export function authenticateAdmin(email: string, password: string) {
  return authenticateStaff(email, password, "admin");
}

export function authenticateCommercial(email: string, password: string) {
  return authenticateStaff(email, password, "commercial");
}

export async function listAdminAccounts() {
  const { env } = await import("cloudflare:workers");
  await ensureAdminTables();
  const result = await env.DB.prepare(
    "SELECT id, email, role, status, created_at AS createdAt FROM portal_admins ORDER BY created_at ASC",
  ).all<{ id: number; email: string; role: string; status: string; createdAt: string }>();
  return result.results;
}

export async function setCustomerAdminAccess(input: {
  oldEmail?: string;
  email: string;
  passwordSalt: string;
  passwordHash: string;
  enabled: boolean;
}) {
  const { env } = await import("cloudflare:workers");
  await ensureAdminTables();
  const email = input.email.trim().toLowerCase();
  const oldEmail = input.oldEmail?.trim().toLowerCase();
  const protectedEmail = bootstrapAdminEmail();
  if (oldEmail && oldEmail !== email && oldEmail !== protectedEmail) {
    const previous = await env.DB.prepare("SELECT id FROM portal_admins WHERE lower(email) = lower(?) LIMIT 1").bind(oldEmail).first<{ id: number }>();
    if (previous) await env.DB.batch([
      env.DB.prepare("DELETE FROM portal_admin_sessions WHERE admin_id = ?").bind(previous.id),
      env.DB.prepare("DELETE FROM portal_admins WHERE id = ?").bind(previous.id),
    ]);
  }
  if (!input.enabled) {
    if (protectedEmail && email === protectedEmail) return;
    const existing = await env.DB.prepare("SELECT id FROM portal_admins WHERE lower(email) = lower(?) LIMIT 1").bind(email).first<{ id: number }>();
    if (existing) await env.DB.batch([
      env.DB.prepare("DELETE FROM portal_admin_sessions WHERE admin_id = ?").bind(existing.id),
      env.DB.prepare("DELETE FROM portal_admins WHERE id = ?").bind(existing.id),
    ]);
    return;
  }
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO portal_admins
    (email, password_salt, password_hash, role, status, created_at, updated_at)
    VALUES (?, ?, ?, 'admin', 'active', ?, ?)
    ON CONFLICT(email) DO UPDATE SET password_salt = excluded.password_salt,
    password_hash = excluded.password_hash, role = 'admin', status = 'active', updated_at = excluded.updated_at`)
    .bind(email, input.passwordSalt, input.passwordHash, now, now).run();
}

export async function createLoginAttemptKey(request: Request, email: string) {
  const address = request.headers.get("cf-connecting-ip") || "unknown";
  return hashToken(`${email.trim().toLowerCase()}|${address}`);
}

export async function isLoginBlocked(key: string) {
  const { env } = await import("cloudflare:workers");
  await ensureAdminTables();
  const row = await env.DB
    .prepare("SELECT blocked_until AS blockedUntil FROM portal_admin_login_attempts WHERE key = ?")
    .bind(key)
    .first<{ blockedUntil: string | null }>();
  return Boolean(row?.blockedUntil && row.blockedUntil > new Date().toISOString());
}

export async function recordLoginFailure(key: string) {
  const { env } = await import("cloudflare:workers");
  const now = new Date();
  const current = await env.DB
    .prepare("SELECT failures, last_attempt_at AS lastAttemptAt FROM portal_admin_login_attempts WHERE key = ?")
    .bind(key)
    .first<{ failures: number; lastAttemptAt: string }>();
  const withinWindow = current && now.getTime() - new Date(current.lastAttemptAt).getTime() < 15 * 60 * 1000;
  const failures = withinWindow ? current.failures + 1 : 1;
  const blockedUntil = failures >= 5
    ? new Date(now.getTime() + 15 * 60 * 1000).toISOString()
    : null;
  await env.DB
    .prepare(
      `INSERT INTO portal_admin_login_attempts (key, failures, last_attempt_at, blocked_until)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET failures = excluded.failures,
       last_attempt_at = excluded.last_attempt_at, blocked_until = excluded.blocked_until`,
    )
    .bind(key, failures, now.toISOString(), blockedUntil)
    .run();
}

export async function clearLoginFailures(key: string) {
  const { env } = await import("cloudflare:workers");
  await env.DB.prepare("DELETE FROM portal_admin_login_attempts WHERE key = ?").bind(key).run();
}

export async function createAdminSession(adminId: number, remember: boolean) {
  const { env } = await import("cloudflare:workers");
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = bytesToBase64(bytes)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  const tokenHash = await hashToken(token);
  const now = new Date();
  const maxAge = remember ? 30 * 24 * 60 * 60 : 12 * 60 * 60;
  const expiresAt = new Date(now.getTime() + maxAge * 1000).toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM portal_admin_sessions WHERE expires_at <= ?").bind(now.toISOString()),
    env.DB.prepare(
      "INSERT INTO portal_admin_sessions (token_hash, admin_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
    ).bind(tokenHash, adminId, expiresAt, now.toISOString()),
  ]);
  return { token, maxAge };
}

async function getStaffBySessionToken(token?: string | null) {
  if (!token) return null;
  const { env } = await import("cloudflare:workers");
  await ensureAdminTables();
  const tokenHash = await hashToken(token);
  const now = new Date().toISOString();
  const row = await env.DB
    .prepare(
      `SELECT a.id, a.email, a.role, a.status
       FROM portal_admin_sessions s
       JOIN portal_admins a ON a.id = s.admin_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND a.status = 'active'
       LIMIT 1`,
    )
    .bind(tokenHash, now)
    .first<AdminRecord>();
  return row || null;
}

export async function getAdminBySessionToken(token?: string | null) {
  const staff = await getStaffBySessionToken(token);
  return staff?.role === "admin" ? staff : null;
}

export async function getCommercialBySessionToken(token?: string | null) {
  const staff = await getStaffBySessionToken(token);
  return staff?.role === "commercial" ? staff : null;
}

export async function deleteAdminSession(token?: string | null) {
  if (!token) return;
  const { env } = await import("cloudflare:workers");
  await ensureAdminTables();
  await env.DB
    .prepare("DELETE FROM portal_admin_sessions WHERE token_hash = ?")
    .bind(await hashToken(token))
    .run();
}

export async function changeAdminPassword(adminId: number, password: string) {
  const { env } = await import("cloudflare:workers");
  const salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
  const hash = bytesToBase64(await derivePassword(password, salt));
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE portal_admins SET password_salt = ?, password_hash = ?, updated_at = ? WHERE id = ?",
    ).bind(salt, hash, new Date().toISOString(), adminId),
    env.DB.prepare("DELETE FROM portal_admin_sessions WHERE admin_id = ?").bind(adminId),
  ]);
}

export function readAdminCookie(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  for (const part of cookieHeader.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === ADMIN_SESSION_COOKIE) return decodeURIComponent(value.join("="));
  }
  return null;
}

export async function getAdminFromRequest(request: Request) {
  return getAdminBySessionToken(readAdminCookie(request));
}

export async function getCommercialFromRequest(request: Request) {
  return getCommercialBySessionToken(readAdminCookie(request));
}
