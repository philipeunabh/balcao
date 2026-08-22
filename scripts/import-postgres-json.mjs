import { readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const TABLES = [
  "portal_settings",
  "portal_admins",
  "portal_admin_sessions",
  "portal_admin_login_attempts",
  "portal_users",
  "portal_registration_verifications",
  "portal_customer_sessions",
  "portal_listings",
  "portal_payments",
  "portal_invoices",
  "portal_live_sessions",
  "portal_live_messages",
  "portal_live_signals",
  "portal_virtual_stores",
  "portal_store_listings",
  "portal_support_tickets",
  "portal_store_renewal_requests",
  "portal_listing_contact_events",
  "portal_analytics_sessions",
  "portal_analytics_pageviews",
  "portal_chat_conversations",
  "portal_chat_messages",
  "portal_ai_chat_sessions",
  "portal_ai_chat_messages",
  "portal_ai_review_jobs",
  "portal_ai_review_queue",
  "portal_ai_review_logs",
  "portal_listing_ai_overrides",
  "portal_import_jobs",
  "portal_import_queue",
  "portal_import_logs",
  "portal_newsletter_subscribers",
  "portal_newsletter_campaigns",
];

const SERIAL_ID_TABLES = new Set([
  "portal_admins",
  "portal_ai_review_logs",
  "portal_import_logs",
  "portal_live_messages",
  "portal_live_signals",
  "portal_support_tickets",
  "portal_users",
]);

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL não foi configurada.");

const inputArgument = process.argv.slice(2).find((argument) => !argument.startsWith("--"));
if (!inputArgument) {
  throw new Error("Informe o arquivo JSON: npm run db:import:postgres -- caminho/exportacao.json");
}

const source = JSON.parse(await readFile(path.resolve(process.cwd(), inputArgument), "utf8"));
const data = source.tables && typeof source.tables === "object" ? source.tables : source;
const sql = postgres(databaseUrl, { max: 1, prepare: false, ssl: "require", connect_timeout: 15 });

const quoteIdentifier = (value) => `"${String(value).replaceAll('"', '""')}"`;

try {
  for (const table of TABLES) {
    const rows = Array.isArray(data[table]) ? data[table] : [];
    if (!rows.length) continue;

    const tableColumns = await sql.unsafe(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1",
      [table],
    );
    const allowedColumns = new Set(tableColumns.map((column) => column.column_name));

    await sql.begin(async (transaction) => {
      for (const row of rows) {
        if (!row || typeof row !== "object" || Array.isArray(row)) continue;
        const entries = Object.entries(row).filter(([column]) => allowedColumns.has(column));
        if (!entries.length) continue;
        const columns = entries.map(([column]) => quoteIdentifier(column)).join(", ");
        const placeholders = entries.map((_, index) => `$${index + 1}`).join(", ");
        await transaction.unsafe(
          `INSERT INTO ${quoteIdentifier(table)} (${columns}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
          entries.map(([, value]) => value),
        );
      }
    });

    if (SERIAL_ID_TABLES.has(table)) {
      const sequence = await sql.unsafe("SELECT pg_get_serial_sequence($1, 'id') AS name", [table]);
      if (sequence[0]?.name) {
        await sql.unsafe(
          `SELECT setval($1, COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM ${quoteIdentifier(table)}`,
          [sequence[0].name],
        );
      }
    }

    process.stdout.write(`Importados ${rows.length} registros de ${table}.\n`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
