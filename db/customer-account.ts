import type { CustomerRecord } from "./customer-auth";

export type SupportTicket = {
  id: number;
  subject: string;
  message: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export async function ensureCustomerAccountTables() {
  const { env } = await import("cloudflare:workers");
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS portal_support_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS portal_support_tickets_user_id_idx ON portal_support_tickets (user_id)"),
  ]);
}

export async function getCustomerTickets(userId: number) {
  const { env } = await import("cloudflare:workers");
  await ensureCustomerAccountTables();
  const result = await env.DB.prepare(`SELECT id, subject, message, status,
    created_at AS createdAt, updated_at AS updatedAt
    FROM portal_support_tickets WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`)
    .bind(userId)
    .all<SupportTicket>();
  return result.results;
}

export async function createCustomerTicket(userId: number, subject: string, message: string) {
  const { env } = await import("cloudflare:workers");
  await ensureCustomerAccountTables();
  const now = new Date().toISOString();
  const result = await env.DB.prepare(`INSERT INTO portal_support_tickets
    (user_id, subject, message, status, created_at, updated_at)
    VALUES (?, ?, ?, 'open', ?, ?)`)
    .bind(userId, subject.trim(), message.trim(), now, now)
    .run();
  return {
    id: Number(result.meta.last_row_id),
    subject: subject.trim(),
    message: message.trim(),
    status: "open",
    createdAt: now,
    updatedAt: now,
  } satisfies SupportTicket;
}

export async function updateCustomerProfile(
  customer: CustomerRecord,
  input: { name: string; whatsapp: string; profileImageUrl: string | null },
) {
  const { env } = await import("cloudflare:workers");
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE portal_users SET name = ?, whatsapp = ?, profile_image_url = ?, updated_at = ? WHERE id = ?")
    .bind(input.name.trim(), input.whatsapp.replace(/\D/g, ""), input.profileImageUrl, now, customer.id)
    .run();
  return { ...customer, name: input.name.trim(), whatsapp: input.whatsapp.replace(/\D/g, ""), profileImageUrl: input.profileImageUrl };
}
