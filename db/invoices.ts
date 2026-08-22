export type InvoiceRecord = {
  id: string;
  userId: number;
  listingId: string;
  invoiceNumber: string;
  listingTitle: string;
  description: string;
  amountCents: number;
  status: "pending" | "paid" | "failed" | "cancelled";
  paymentMethod: string | null;
  issuedAt: string;
  updatedAt: string;
};

export async function ensureInvoiceTables() {
  const { env } = await import("cloudflare:workers");
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS portal_invoices (
      id TEXT PRIMARY KEY NOT NULL,
      user_id INTEGER NOT NULL,
      listing_id TEXT NOT NULL UNIQUE,
      invoice_number TEXT NOT NULL UNIQUE,
      listing_title TEXT NOT NULL,
      description TEXT NOT NULL,
      amount_cents INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      payment_method TEXT,
      issued_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS portal_invoices_user_id_idx ON portal_invoices (user_id, issued_at)"),
  ]);
}

function selectColumns() {
  return `id, user_id AS userId, listing_id AS listingId, invoice_number AS invoiceNumber,
    listing_title AS listingTitle, description, amount_cents AS amountCents, status,
    payment_method AS paymentMethod, issued_at AS issuedAt, updated_at AS updatedAt`;
}

function invoiceDescription(publicationType: string, planLabel?: string | null) {
  if (publicationType === "free") return "Anúncio grátis - validade de 30 dias";
  return planLabel || (publicationType === "super_featured" ? "Super destaque" : "Anúncio destacado");
}

export async function createListingInvoice(input: {
  userId: number;
  listingId: string;
  listingTitle: string;
  publicationType: string;
  planLabel?: string | null;
  amountCents: number;
  paymentMethod?: string | null;
  status: InvoiceRecord["status"];
  issuedAt?: string;
}) {
  const { env } = await import("cloudflare:workers");
  await ensureInvoiceTables();
  const now = input.issuedAt || new Date().toISOString();
  const id = `inv-${input.listingId}`;
  const invoiceNumber = `BL-${input.listingId.slice(0, 8).toUpperCase()}`;
  await env.DB.prepare(`INSERT INTO portal_invoices (
    id, user_id, listing_id, invoice_number, listing_title, description, amount_cents,
    status, payment_method, issued_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(listing_id) DO UPDATE SET listing_title=excluded.listing_title,
    description=excluded.description, amount_cents=excluded.amount_cents,
    status=excluded.status, payment_method=excluded.payment_method, updated_at=excluded.updated_at`)
    .bind(id, input.userId, input.listingId, invoiceNumber, input.listingTitle,
      invoiceDescription(input.publicationType, input.planLabel), input.amountCents,
      input.status, input.paymentMethod || null, now, now).run();
  return id;
}

async function backfillUserInvoices(userId: number) {
  const { env } = await import("cloudflare:workers");
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT OR IGNORE INTO portal_invoices (
    id, user_id, listing_id, invoice_number, listing_title, description, amount_cents,
    status, payment_method, issued_at, updated_at
  ) SELECT 'inv-' || id, user_id, id, 'BL-' || UPPER(SUBSTR(id, 1, 8)), title,
    CASE WHEN publication_type='free' THEN 'Anúncio grátis - validade de 30 dias'
      WHEN publication_type='super_featured' THEN 'Super destaque' ELSE 'Anúncio destacado' END,
    COALESCE(payment_amount_cents, 0),
    CASE WHEN publication_type='free' OR payment_status='paid' THEN 'paid'
      WHEN payment_status IN ('failed','declined','expired') THEN 'failed' ELSE 'pending' END,
    payment_method, created_at, ? FROM portal_listings WHERE user_id=?`)
    .bind(now, userId).run();
}

export async function listUserInvoices(userId: number) {
  const { env } = await import("cloudflare:workers");
  await ensureInvoiceTables();
  await backfillUserInvoices(userId);
  return (await env.DB.prepare(`SELECT ${selectColumns()} FROM portal_invoices WHERE user_id=? ORDER BY issued_at DESC`)
    .bind(userId).all<InvoiceRecord>()).results;
}

export async function getUserInvoice(id: string, userId: number) {
  const { env } = await import("cloudflare:workers");
  await ensureInvoiceTables();
  await backfillUserInvoices(userId);
  return env.DB.prepare(`SELECT ${selectColumns()} FROM portal_invoices WHERE user_id=? AND (id=? OR listing_id=?) LIMIT 1`)
    .bind(userId, id, id).first<InvoiceRecord>();
}

export async function updateInvoiceStatusByListing(listingId: string, status: InvoiceRecord["status"], paymentMethod?: string | null) {
  const { env } = await import("cloudflare:workers");
  await ensureInvoiceTables();
  await env.DB.prepare(`UPDATE portal_invoices SET status=?, payment_method=COALESCE(?,payment_method), updated_at=? WHERE listing_id=?`)
    .bind(status, paymentMethod || null, new Date().toISOString(), listingId).run();
}
