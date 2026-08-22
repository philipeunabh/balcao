import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error("DATABASE_URL não foi configurada.");
}

const migrationsDirectory = path.resolve(process.cwd(), "drizzle-postgres");
const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith(".sql")).sort();
if (!files.length) throw new Error("Nenhuma migração PostgreSQL foi encontrada.");

const sql = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  ssl: "require",
  connect_timeout: 15,
});

try {
  await sql.unsafe(`CREATE TABLE IF NOT EXISTS portal_schema_migrations (
    name TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);

  for (const file of files) {
    const source = await readFile(path.join(migrationsDirectory, file), "utf8");
    const checksum = createHash("sha256").update(source).digest("hex");
    const existing = await sql.unsafe("SELECT checksum FROM portal_schema_migrations WHERE name = $1 LIMIT 1", [file]);
    if (existing.length) {
      if (existing[0].checksum !== checksum) throw new Error(`A migração aplicada ${file} foi alterada.`);
      continue;
    }
    const statements = source.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean);
    await sql.begin(async (transaction) => {
      for (const statement of statements) await transaction.unsafe(statement);
      await transaction.unsafe(
        "INSERT INTO portal_schema_migrations (name, checksum, applied_at) VALUES ($1, $2, $3)",
        [file, checksum, new Date().toISOString()],
      );
    });
  }
} finally {
  await sql.end({ timeout: 5 });
}
