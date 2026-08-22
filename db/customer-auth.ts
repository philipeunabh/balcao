const PBKDF2_ITERATIONS = 100_000;

export const CUSTOMER_SESSION_COOKIE = "balcao_customer_session";

export type CustomerRecord = {
  id: number;
  accountType: "particular" | "empresa";
  taxId: string;
  email: string;
  name: string;
  whatsapp: string;
  profileImageUrl: string | null;
  isAdmin: boolean;
  status: string;
  planCode: string;
  planName: string;
  adLimit: number;
  activeAds: number;
  createdAt: string;
};

type PendingRegistration = {
  id: string;
  accountType: "particular" | "empresa";
  taxId: string;
  email: string;
  name: string;
  whatsapp: string;
  passwordSalt: string;
  passwordHash: string;
  codeHash: string;
  expiresAt: string;
  attempts: number;
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

async function hashText(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToBase64(new Uint8Array(digest));
}

function randomToken(byteLength = 32) {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(byteLength)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function isValidCpf(value: string) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  const digit = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cpf[index]) * (length + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

export function isValidCnpj(value: string) {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const calculate = (length: number) => {
    const weights = length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((total, weight, index) => total + Number(cnpj[index]) * weight, 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return calculate(12) === Number(cnpj[12]) && calculate(13) === Number(cnpj[13]);
}

export async function ensureCustomerTables() {
  const { env } = await import("cloudflare:workers");
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS portal_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_type TEXT NOT NULL,
      tax_id TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      whatsapp TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      plan_code TEXT NOT NULL DEFAULT 'free-10',
      plan_name TEXT NOT NULL DEFAULT 'Plano Gratuito',
      ad_limit INTEGER NOT NULL DEFAULT 10,
      active_ads INTEGER NOT NULL DEFAULT 0,
      verified_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS portal_registration_verifications (
      id TEXT PRIMARY KEY NOT NULL,
      account_type TEXT NOT NULL,
      tax_id TEXT NOT NULL,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      whatsapp TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS portal_customer_sessions (
      token_hash TEXT PRIMARY KEY NOT NULL,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS portal_customer_sessions_user_id_idx ON portal_customer_sessions (user_id)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS portal_registration_email_idx ON portal_registration_verifications (email)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS portal_registration_tax_id_idx ON portal_registration_verifications (tax_id)"),
  ]);
  const columns = await env.DB.prepare("PRAGMA table_info(portal_users)").all<{ name: string }>();
  const names = new Set(columns.results.map((column) => column.name));
  if (!names.has("profile_image_url")) await env.DB.prepare("ALTER TABLE portal_users ADD COLUMN profile_image_url TEXT").run();
  if (!names.has("is_admin")) await env.DB.prepare("ALTER TABLE portal_users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0").run();
}

export async function findCustomerDuplicate(email: string, taxId: string) {
  const { env } = await import("cloudflare:workers");
  await ensureCustomerTables();
  return env.DB.prepare(
    "SELECT email, tax_id AS taxId FROM portal_users WHERE lower(email) = lower(?) OR tax_id = ? LIMIT 1",
  ).bind(email.trim(), taxId).first<{ email: string; taxId: string }>();
}

export async function findCustomerForChatLookup(email: string, taxId: string, whatsapp: string) {
  const { env } = await import("cloudflare:workers");
  await ensureCustomerTables();
  const exact = await env.DB.prepare(`SELECT id,email,name,whatsapp,status FROM portal_users
    WHERE lower(email)=lower(?) AND tax_id=? AND whatsapp=? LIMIT 1`)
    .bind(email.trim(),onlyDigits(taxId),onlyDigits(whatsapp)).first<{ id: number; email: string; name: string; whatsapp: string; status: string }>();
  if (exact?.status === "active") return { exists: true as const, name: exact.name, email: exact.email };
  const collision = await env.DB.prepare("SELECT id FROM portal_users WHERE lower(email)=lower(?) OR tax_id=? LIMIT 1")
    .bind(email.trim(),onlyDigits(taxId)).first();
  return collision ? { exists: false as const, conflict: true as const } : { exists: false as const, conflict: false as const };
}

export async function createPendingRegistration(input: {
  accountType: "particular" | "empresa";
  taxId: string;
  email: string;
  name: string;
  whatsapp: string;
  password: string;
}) {
  const { env } = await import("cloudflare:workers");
  await ensureCustomerTables();
  const id = randomToken(24);
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 10_000).padStart(4, "0");
  const salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
  const passwordHash = bytesToBase64(await derivePassword(input.password, salt));
  const codeHash = await hashText(`${id}:${code}`);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM portal_registration_verifications WHERE expires_at <= ? OR lower(email) = lower(?) OR tax_id = ?")
      .bind(now.toISOString(), input.email, input.taxId),
    env.DB.prepare(`INSERT INTO portal_registration_verifications
      (id, account_type, tax_id, email, name, whatsapp, password_salt, password_hash, code_hash, expires_at, attempts, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`)
      .bind(id, input.accountType, input.taxId, input.email, input.name, input.whatsapp, salt, passwordHash, codeHash, expiresAt, now.toISOString()),
  ]);
  return { id, code, expiresAt };
}

export async function createCustomerWithoutVerification(input: {
  accountType: "particular" | "empresa";
  taxId: string;
  email: string;
  name: string;
  whatsapp: string;
  password: string;
}) {
  const { env } = await import("cloudflare:workers");
  await ensureCustomerTables();
  const salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
  const passwordHash = bytesToBase64(await derivePassword(input.password, salt));
  const now = new Date().toISOString();
  const inserted = await env.DB.prepare(`INSERT INTO portal_users
    (account_type, tax_id, email, name, whatsapp, password_salt, password_hash, status,
     plan_code, plan_name, ad_limit, active_ads, verified_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 'free-10', 'Plano Gratuito', 10, 0, ?, ?, ?)`)
    .bind(input.accountType, input.taxId, input.email, input.name, input.whatsapp,
      salt, passwordHash, now, now, now).run();
  return { userId: Number(inserted.meta.last_row_id) };
}

export async function deletePendingRegistration(id: string) {
  const { env } = await import("cloudflare:workers");
  await ensureCustomerTables();
  await env.DB.prepare("DELETE FROM portal_registration_verifications WHERE id = ?").bind(id).run();
}

export async function verifyPendingRegistration(id: string, code: string) {
  const { env } = await import("cloudflare:workers");
  await ensureCustomerTables();
  const pending = await env.DB.prepare(`SELECT id, account_type AS accountType, tax_id AS taxId,
    email, name, whatsapp, password_salt AS passwordSalt, password_hash AS passwordHash,
    code_hash AS codeHash, expires_at AS expiresAt, attempts
    FROM portal_registration_verifications WHERE id = ? LIMIT 1`)
    .bind(id).first<PendingRegistration>();
  if (!pending) return { error: "Código inválido ou cadastro não localizado." } as const;
  if (pending.expiresAt <= new Date().toISOString()) {
    await deletePendingRegistration(id);
    return { error: "O código expirou. Inicie o cadastro novamente." } as const;
  }
  if (pending.attempts >= 5) {
    await deletePendingRegistration(id);
    return { error: "Limite de tentativas excedido. Inicie o cadastro novamente." } as const;
  }
  const receivedHash = await hashText(`${id}:${onlyDigits(code)}`);
  if (!secureEqual(new TextEncoder().encode(receivedHash), new TextEncoder().encode(pending.codeHash))) {
    await env.DB.prepare("UPDATE portal_registration_verifications SET attempts = attempts + 1 WHERE id = ?").bind(id).run();
    return { error: "Código de confirmação incorreto." } as const;
  }
  const duplicate = await findCustomerDuplicate(pending.email, pending.taxId);
  if (duplicate) {
    await deletePendingRegistration(id);
    return { error: duplicate.taxId === pending.taxId ? "CPF/CNPJ já cadastrado." : "E-mail já cadastrado." } as const;
  }
  const now = new Date().toISOString();
  const inserted = await env.DB.prepare(`INSERT INTO portal_users
    (account_type, tax_id, email, name, whatsapp, password_salt, password_hash, status,
     plan_code, plan_name, ad_limit, active_ads, verified_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 'free-10', 'Plano Gratuito', 10, 0, ?, ?, ?)`)
    .bind(pending.accountType, pending.taxId, pending.email, pending.name, pending.whatsapp,
      pending.passwordSalt, pending.passwordHash, now, now, now).run();
  await deletePendingRegistration(id);
  return { userId: Number(inserted.meta.last_row_id) } as const;
}

export async function authenticateCustomer(email: string, password: string) {
  const { env } = await import("cloudflare:workers");
  await ensureCustomerTables();
  const row = await env.DB.prepare(`SELECT id, password_salt AS passwordSalt, password_hash AS passwordHash, status
    FROM portal_users WHERE lower(email) = lower(?) LIMIT 1`)
    .bind(email.trim()).first<{ id: number; passwordSalt: string; passwordHash: string; status: string }>();
  if (!row || row.status !== "active") return null;
  const derived = await derivePassword(password, row.passwordSalt);
  if (!secureEqual(derived, base64ToBytes(row.passwordHash))) return null;
  return { id: row.id };
}

export async function listCustomersForAdmin() {
  const { env } = await import("cloudflare:workers");
  await ensureCustomerTables();
  const result = await env.DB.prepare(`SELECT id, name, email, account_type AS accountType,
    tax_id AS taxId, whatsapp, profile_image_url AS profileImageUrl, is_admin AS isAdmin,
    status, plan_name AS planName, ad_limit AS adLimit, active_ads AS activeAds,
    created_at AS createdAt FROM portal_users ORDER BY created_at DESC`).all<{
      id: number; name: string; email: string; accountType: string; taxId: string;
      whatsapp: string; profileImageUrl: string | null; isAdmin: number; status: string;
      planName: string; adLimit: number; activeAds: number; createdAt: string;
    }>();
  return result.results.map((customer) => ({ ...customer, isAdmin: customer.isAdmin === 1 }));
}

export type AdminCustomerInput = {
  accountType: "particular" | "empresa";
  taxId: string;
  email: string;
  name: string;
  whatsapp: string;
  password?: string;
  profileImageUrl?: string | null;
  isAdmin: boolean;
};

export async function createCustomerFromAdmin(input: AdminCustomerInput & { password: string }) {
  const { env } = await import("cloudflare:workers");
  await ensureCustomerTables();
  const salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
  const passwordHash = bytesToBase64(await derivePassword(input.password, salt));
  const now = new Date().toISOString();
  const inserted = await env.DB.prepare(`INSERT INTO portal_users
    (account_type, tax_id, email, name, whatsapp, profile_image_url, is_admin,
     password_salt, password_hash, status, plan_code, plan_name, ad_limit, active_ads,
     verified_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'free-10', 'Plano Gratuito', 10, 0, ?, ?, ?)`) 
    .bind(input.accountType, input.taxId, input.email.trim().toLowerCase(), input.name.trim(), input.whatsapp,
      input.profileImageUrl || null, input.isAdmin ? 1 : 0, salt, passwordHash, now, now, now).run();
  return { id: Number(inserted.meta.last_row_id), salt, passwordHash, email: input.email.trim().toLowerCase() };
}

export async function updateCustomerFromAdmin(id: number, input: AdminCustomerInput) {
  const { env } = await import("cloudflare:workers");
  await ensureCustomerTables();
  const current = await env.DB.prepare(`SELECT email, password_salt AS passwordSalt,
    password_hash AS passwordHash FROM portal_users WHERE id = ? LIMIT 1`)
    .bind(id).first<{ email: string; passwordSalt: string; passwordHash: string }>();
  if (!current) return null;
  let passwordSalt = current.passwordSalt;
  let passwordHash = current.passwordHash;
  if (input.password) {
    passwordSalt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
    passwordHash = bytesToBase64(await derivePassword(input.password, passwordSalt));
  }
  const email = input.email.trim().toLowerCase();
  await env.DB.prepare(`UPDATE portal_users SET account_type = ?, tax_id = ?, email = ?,
    name = ?, whatsapp = ?, profile_image_url = ?, is_admin = ?, password_salt = ?,
    password_hash = ?, updated_at = ? WHERE id = ?`)
    .bind(input.accountType, input.taxId, email, input.name.trim(), input.whatsapp,
      input.profileImageUrl || null, input.isAdmin ? 1 : 0, passwordSalt, passwordHash,
      new Date().toISOString(), id).run();
  return { id, oldEmail: current.email, email, salt: passwordSalt, passwordHash };
}

export const IMPORT_ACCOUNT_EMAIL = "importacao@balcao.com";

export async function ensureImportCustomer() {
  const { env } = await import("cloudflare:workers");
  await ensureCustomerTables();
  const existing = await env.DB.prepare("SELECT id FROM portal_users WHERE lower(email) IN (lower(?), lower('importacao@palcao.com.br')) ORDER BY CASE WHEN lower(email)=lower(?) THEN 0 ELSE 1 END LIMIT 1")
    .bind(IMPORT_ACCOUNT_EMAIL, IMPORT_ACCOUNT_EMAIL).first<{ id: number }>();
  const now = new Date().toISOString();
  if (existing) {
    await env.DB.prepare(`UPDATE portal_users SET name = 'Importação de anúncios', status = 'active',
      plan_code = 'import-unlimited', plan_name = 'Importador do sistema', ad_limit = 1000000, updated_at = ? WHERE id = ?`)
      .bind(now, existing.id).run();
    return existing.id;
  }
  const salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
  const passwordHash = bytesToBase64(await derivePassword(randomToken(48), salt));
  const inserted = await env.DB.prepare(`INSERT INTO portal_users
    (account_type, tax_id, email, name, whatsapp, password_salt, password_hash, status,
     plan_code, plan_name, ad_limit, active_ads, verified_at, created_at, updated_at)
    VALUES ('empresa', 'IMPORTADOR-SISTEMA', ?, 'Importação de anúncios', '31000000000', ?, ?, 'active',
      'import-unlimited', 'Importador do sistema', 1000000, 0, ?, ?, ?)`)
    .bind(IMPORT_ACCOUNT_EMAIL, salt, passwordHash, now, now, now).run();
  return Number(inserted.meta.last_row_id);
}

export async function createCustomerSession(userId: number, remember = true) {
  const { env } = await import("cloudflare:workers");
  await ensureCustomerTables();
  const token = randomToken();
  const tokenHash = await hashText(token);
  const now = new Date();
  // Sessões longas evitam que o painel derrube o anunciante durante o trabalho.
  // Mesmo sem "lembrar", uma sessão autenticada permanece válida por 7 dias.
  const maxAge = remember ? 90 * 24 * 60 * 60 : 7 * 24 * 60 * 60;
  const expiresAt = new Date(now.getTime() + maxAge * 1000).toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM portal_customer_sessions WHERE expires_at <= ?").bind(now.toISOString()),
    env.DB.prepare("INSERT INTO portal_customer_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
      .bind(tokenHash, userId, expiresAt, now.toISOString()),
  ]);
  return { token, maxAge };
}

export async function getCustomerBySessionToken(token?: string | null) {
  if (!token) return null;
  const { env } = await import("cloudflare:workers");
  await ensureCustomerTables();
  return env.DB.prepare(`SELECT u.id, u.account_type AS accountType, u.tax_id AS taxId, u.email,
    u.name, u.whatsapp, u.profile_image_url AS profileImageUrl, u.is_admin AS isAdmin,
    u.status, u.plan_code AS planCode, u.plan_name AS planName,
    u.ad_limit AS adLimit, u.active_ads AS activeAds, u.created_at AS createdAt
    FROM portal_customer_sessions s JOIN portal_users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'active' LIMIT 1`)
    .bind(await hashText(token), new Date().toISOString()).first<CustomerRecord>();
}

export function readCustomerCookie(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  for (const part of cookieHeader.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === CUSTOMER_SESSION_COOKIE) return decodeURIComponent(value.join("="));
  }
  return null;
}

export async function deleteCustomerSession(token?: string | null) {
  if (!token) return;
  const { env } = await import("cloudflare:workers");
  await ensureCustomerTables();
  await env.DB.prepare("DELETE FROM portal_customer_sessions WHERE token_hash = ?")
    .bind(await hashText(token)).run();
}

export function customerPublicSlug(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

export async function getPublicAdvertiserBySlug(slug: string) {
  const { env } = await import("cloudflare:workers"); await ensureCustomerTables();
  const users = (await env.DB.prepare(`SELECT id,name,whatsapp,profile_image_url AS profileImageUrl,created_at AS createdAt
    FROM portal_users WHERE status='active' ORDER BY created_at ASC`).all<{ id: number; name: string; whatsapp: string; profileImageUrl: string | null; createdAt: string }>()).results;
  return users.find((user) => customerPublicSlug(user.name) === slug) || null;
}

export async function listPublicAdvertiserSlugs() {
  const { env } = await import("cloudflare:workers");
  await ensureCustomerTables();
  const result = await env.DB.prepare(`SELECT DISTINCT u.name FROM portal_users u
    JOIN portal_listings l ON l.user_id = u.id
    WHERE u.status = 'active' AND l.status = 'active' ORDER BY u.name ASC`).all<{ name: string }>();
  return result.results.map((item) => customerPublicSlug(item.name)).filter(Boolean);
}
