export type SavedCard = { id: string; brand: string | null; last4: string; holderName: string; createdAt: string };

async function ensureSavedCardTable() {
  const { env } = await import("cloudflare:workers");
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS portal_saved_cards (
      id TEXT PRIMARY KEY NOT NULL, user_id INTEGER NOT NULL, provider TEXT NOT NULL,
      provider_token TEXT NOT NULL, brand TEXT, last4 TEXT NOT NULL, holder_name TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS portal_saved_cards_user_idx ON portal_saved_cards (user_id, created_at DESC)"),
  ]);
}

export async function savePagBankCard(userId: number, input: { token: string; brand: string | null; last4: string; holderName: string }) {
  const { env } = await import("cloudflare:workers"); await ensureSavedCardTable();
  const now = new Date().toISOString(); const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO portal_saved_cards (id,user_id,provider,provider_token,brand,last4,holder_name,created_at,updated_at)
    VALUES (?,?,'pagbank',?,?,?,?,?,?)`).bind(id, userId, input.token, input.brand, input.last4, input.holderName, now, now).run();
  return { id, brand: input.brand, last4: input.last4, holderName: input.holderName, createdAt: now };
}

export async function listSavedCards(userId: number) {
  const { env } = await import("cloudflare:workers"); await ensureSavedCardTable();
  return (await env.DB.prepare(`SELECT id,brand,last4,holder_name AS holderName,created_at AS createdAt FROM portal_saved_cards
    WHERE user_id=? ORDER BY created_at DESC`).bind(userId).all<SavedCard>()).results;
}

export async function getSavedCardToken(id: string, userId: number) {
  const { env } = await import("cloudflare:workers"); await ensureSavedCardTable();
  return env.DB.prepare("SELECT provider_token AS token, holder_name AS holderName FROM portal_saved_cards WHERE id=? AND user_id=? LIMIT 1")
    .bind(id,userId).first<{ token: string; holderName: string }>();
}

export async function deleteSavedCard(id: string, userId: number) {
  const { env } = await import("cloudflare:workers"); await ensureSavedCardTable();
  await env.DB.prepare("DELETE FROM portal_saved_cards WHERE id=? AND user_id=?").bind(id,userId).run();
}
