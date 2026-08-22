export type PaymentRecord = {
  id: string;
  userId: number;
  listingId: string;
  provider: string;
  providerReference: string | null;
  method: "PIX" | "CREDIT_CARD";
  amountCents: number;
  status: "pending" | "paid" | "failed" | "declined" | "expired";
  providerStatus: string | null;
  planCode: string | null;
  planLabel: string | null;
  description: string;
  cardBrand: string | null;
  cardLast4: string | null;
  paidAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function ensurePaymentTables() {
  const { env } = await import("cloudflare:workers");
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS portal_payments (
      id TEXT PRIMARY KEY NOT NULL,
      user_id INTEGER NOT NULL,
      listing_id TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'pagbank',
      provider_reference TEXT,
      method TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      provider_status TEXT,
      plan_code TEXT,
      plan_label TEXT,
      description TEXT NOT NULL,
      card_brand TEXT,
      card_last4 TEXT,
      paid_at TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS portal_payments_user_id_idx ON portal_payments (user_id, created_at)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS portal_payments_listing_id_idx ON portal_payments (listing_id, created_at)"),
    env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS portal_payments_provider_reference_idx ON portal_payments (provider_reference) WHERE provider_reference IS NOT NULL"),
  ]);
}

function selectColumns() {
  return `id, user_id AS userId, listing_id AS listingId, provider, provider_reference AS providerReference,
    method, amount_cents AS amountCents, status, provider_status AS providerStatus, plan_code AS planCode,
    plan_label AS planLabel, description, card_brand AS cardBrand, card_last4 AS cardLast4,
    paid_at AS paidAt, expires_at AS expiresAt, created_at AS createdAt, updated_at AS updatedAt`;
}

export async function createPaymentRecord(input: {
  userId: number;
  listingId: string;
  providerReference?: string | null;
  method: "PIX" | "CREDIT_CARD";
  amountCents: number;
  status: PaymentRecord["status"];
  providerStatus?: string | null;
  planCode?: string | null;
  planLabel?: string | null;
  description: string;
  cardBrand?: string | null;
  cardLast4?: string | null;
  paidAt?: string | null;
  expiresAt?: string | null;
}) {
  const { env } = await import("cloudflare:workers");
  await ensurePaymentTables();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO portal_payments (
    id, user_id, listing_id, provider, provider_reference, method, amount_cents, status, provider_status,
    plan_code, plan_label, description, card_brand, card_last4, paid_at, expires_at, created_at, updated_at
  ) VALUES (?, ?, ?, 'pagbank', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    id, input.userId, input.listingId, input.providerReference || null, input.method, input.amountCents,
    input.status, input.providerStatus || null, input.planCode || null, input.planLabel || null,
    input.description, input.cardBrand || null, input.cardLast4 || null, input.paidAt || null,
    input.expiresAt || null, now, now,
  ).run();
  return id;
}

export async function updatePaymentByReference(reference: string, input: {
  status: PaymentRecord["status"];
  providerStatus?: string | null;
  paidAt?: string | null;
}) {
  const { env } = await import("cloudflare:workers");
  await ensurePaymentTables();
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE portal_payments
    SET status = ?, provider_status = COALESCE(?, provider_status), paid_at = COALESCE(?, paid_at), updated_at = ?
    WHERE provider_reference = ?`).bind(input.status, input.providerStatus || null, input.paidAt || null, now, reference).run();
}

export async function listUserPayments(userId: number) {
  const { env } = await import("cloudflare:workers");
  await ensurePaymentTables();
  return (await env.DB.prepare(`SELECT ${selectColumns()} FROM portal_payments WHERE user_id = ? ORDER BY created_at DESC`)
    .bind(userId).all<PaymentRecord>()).results;
}

export async function getUserPayment(id: string, userId: number) {
  const { env } = await import("cloudflare:workers");
  await ensurePaymentTables();
  return env.DB.prepare(`SELECT ${selectColumns()} FROM portal_payments WHERE id = ? AND user_id = ? LIMIT 1`)
    .bind(id, userId).first<PaymentRecord>();
}

export async function listAllPayments() {
  const { env } = await import("cloudflare:workers");
  await ensurePaymentTables();
  return (await env.DB.prepare(`SELECT ${selectColumns()} FROM portal_payments ORDER BY created_at DESC`).all<PaymentRecord>()).results;
}
