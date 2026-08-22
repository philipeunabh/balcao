import { NextResponse } from "next/server";
import { recordAnalyticsEvent } from "../../../../db/analytics";

const COOKIE = "balcao_analytics_session";
function readCookie(request: Request) {
  const value = request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))?.[1] || "";
  return /^[a-f0-9-]{20,80}$/i.test(value) ? value : crypto.randomUUID();
}
export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  const event = payload.event === "heartbeat" ? "heartbeat" : payload.event === "pageview" ? "pageview" : null;
  const path = typeof payload.path === "string" ? payload.path : "";
  if (!event || !path) return NextResponse.json({ error: "Evento inválido." }, { status: 400 });
  const sessionId = readCookie(request);
  const userAgent = request.headers.get("user-agent") || "";
  const deviceType = /Mobile|Android|iPhone|iPad/i.test(userAgent) ? "mobile" : "desktop";
  await recordAnalyticsEvent({ sessionId, path, event, deviceType });
  const response = new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  response.cookies.set(COOKIE, sessionId, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 30 * 60 });
  return response;
}
