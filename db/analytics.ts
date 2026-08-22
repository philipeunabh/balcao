import { SITE_URL } from "../lib/site-url";

export type AnalyticsRange = "24h" | "7d" | "30d";

export async function ensureAnalyticsTables() {
  const { env } = await import("cloudflare:workers");
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS portal_analytics_sessions (
      id TEXT PRIMARY KEY NOT NULL, first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
      landing_path TEXT NOT NULL, current_path TEXT NOT NULL, device_type TEXT NOT NULL, pageviews INTEGER NOT NULL DEFAULT 0
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS portal_analytics_pageviews (
      id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL, path TEXT NOT NULL,
      listing_id TEXT, occurred_at TEXT NOT NULL
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS portal_analytics_sessions_last_seen_idx ON portal_analytics_sessions (last_seen_at)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS portal_analytics_pageviews_occurred_idx ON portal_analytics_pageviews (occurred_at)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS portal_analytics_pageviews_path_idx ON portal_analytics_pageviews (path, occurred_at)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS portal_analytics_pageviews_listing_idx ON portal_analytics_pageviews (listing_id, occurred_at)"),
  ]);
}

function normalizePath(value: string) {
  try {
    const url = new URL(value, SITE_URL);
    if (url.origin !== SITE_URL) return "";
    const path = `${url.pathname}${url.search}`.slice(0, 500);
    if (/^\/(api|admin|comercial)(\/|$)/.test(url.pathname)) return "";
    return path || "/";
  } catch { return ""; }
}

function listingIdFromPath(path: string) {
  const match = path.match(/^\/anuncio\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]).slice(0, 120) : null;
}

export async function recordAnalyticsEvent(input: { sessionId: string; path: string; event: "pageview" | "heartbeat"; deviceType: string }) {
  const { env } = await import("cloudflare:workers");
  await ensureAnalyticsTables();
  const path = normalizePath(input.path); if (!path) return false;
  const now = new Date().toISOString();
  if (input.event === "heartbeat") {
    await env.DB.prepare("UPDATE portal_analytics_sessions SET last_seen_at=?,current_path=? WHERE id=?").bind(now, path, input.sessionId).run();
    return true;
  }
  const duplicateSince = new Date(Date.now() - 3_000).toISOString();
  const duplicate = await env.DB.prepare("SELECT id FROM portal_analytics_pageviews WHERE session_id=? AND path=? AND occurred_at>=? LIMIT 1")
    .bind(input.sessionId, path, duplicateSince).first<{ id: string }>();
  const increment = duplicate ? 0 : 1;
  const statements = [env.DB.prepare(`INSERT INTO portal_analytics_sessions (id,first_seen_at,last_seen_at,landing_path,current_path,device_type,pageviews)
    VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET last_seen_at=excluded.last_seen_at,current_path=excluded.current_path,pageviews=portal_analytics_sessions.pageviews+?`)
    .bind(input.sessionId, now, now, path, path, input.deviceType, increment, increment)];
  if (!duplicate) statements.push(env.DB.prepare("INSERT INTO portal_analytics_pageviews (id,session_id,path,listing_id,occurred_at) VALUES (?,?,?,?,?)")
    .bind(crypto.randomUUID(), input.sessionId, path, listingIdFromPath(path), now));
  await env.DB.batch(statements);
  return true;
}

export async function getAnalyticsDashboard(range: AnalyticsRange = "24h") {
  const { env } = await import("cloudflare:workers");
  await ensureAnalyticsTables();
  const hours = range === "30d" ? 720 : range === "7d" ? 168 : 24;
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();
  const activeSince = new Date(Date.now() - 5 * 60_000).toISOString();
  const [summary, totals, topPages, activePages, listings] = await Promise.all([
    env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM portal_analytics_pageviews WHERE occurred_at>=?) AS pageviews,
      (SELECT COUNT(DISTINCT session_id) FROM portal_analytics_pageviews WHERE occurred_at>=?) AS sessions,
      (SELECT COUNT(*) FROM portal_analytics_sessions WHERE last_seen_at>=?) AS activeVisitors`).bind(since, since, activeSince).first<Record<string, number>>(),
    env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM portal_analytics_pageviews) AS pageviews,
      (SELECT COUNT(*) FROM portal_analytics_sessions) AS sessions`).first<Record<string, number>>(),
    env.DB.prepare(`SELECT path,COUNT(*) AS pageviews,COUNT(DISTINCT session_id) AS sessions
      FROM portal_analytics_pageviews WHERE occurred_at>=? GROUP BY path ORDER BY pageviews DESC LIMIT 20`).bind(since).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT current_path AS path,COUNT(*) AS visitors FROM portal_analytics_sessions
      WHERE last_seen_at>=? GROUP BY current_path ORDER BY visitors DESC LIMIT 12`).bind(activeSince).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT l.id,l.title,
      COUNT(p.id) AS pageviews,COUNT(DISTINCT p.session_id) AS sessions
      FROM portal_listings l LEFT JOIN portal_analytics_pageviews p ON p.listing_id=l.id AND p.occurred_at>=?
      GROUP BY l.id,l.title ORDER BY pageviews DESC,l.created_at DESC LIMIT 50`).bind(since).all<Record<string, unknown>>(),
  ]);
  return {
    range,
    generatedAt: new Date().toISOString(),
    summary: { activeVisitors: Number(summary?.activeVisitors || 0), pageviews: Number(summary?.pageviews || 0), sessions: Number(summary?.sessions || 0), totalPageviews: Number(totals?.pageviews || 0), totalSessions: Number(totals?.sessions || 0) },
    topPages: topPages.results.map((row) => ({ path: String(row.path), pageviews: Number(row.pageviews || 0), sessions: Number(row.sessions || 0) })),
    activePages: activePages.results.map((row) => ({ path: String(row.path), visitors: Number(row.visitors || 0) })),
    listings: listings.results.map((row) => ({ id: String(row.id), title: String(row.title), pageviews: Number(row.pageviews || 0), sessions: Number(row.sessions || 0) })),
  };
}
