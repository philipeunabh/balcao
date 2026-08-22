import { NextResponse } from "next/server";
import { getAdminFromRequest } from "../../../../db/admin-auth";
import { readPortalSettings, readPrivateSetting, writePortalSettings } from "../../../../db/settings";

type CloudflareResponse<T> = { success?: boolean; result?: T; errors?: Array<{ message?: string }> };

async function authorized(request: Request) { return Boolean(await getAdminFromRequest(request)); }
function clean(value: unknown, max = 500) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function validZoneId(value: string) { return /^[a-f0-9]{32}$/i.test(value); }
function apiError(data: CloudflareResponse<unknown>, fallback: string) { return data.errors?.map((item) => item.message).filter(Boolean).join(" · ") || fallback; }

async function credentials(body: Record<string, unknown>, persist = false) {
  const current = await readPortalSettings();
  const submittedToken = clean(body.apiToken, 500);
  const submittedZone = clean(body.zoneId, 64);
  const apiToken = submittedToken || await readPrivateSetting("cloudflare_api_token");
  const zoneId = submittedZone || (typeof current.cloudflare_zone_id === "string" ? current.cloudflare_zone_id : "");
  if (!apiToken || apiToken.length < 20) throw new Error("Informe um token válido da API Cloudflare.");
  if (!validZoneId(zoneId)) throw new Error("Informe o Zone ID de 32 caracteres exibido no painel Cloudflare.");
  if (persist) await writePortalSettings({ ...(submittedToken ? { cloudflare_api_token: submittedToken } : {}), cloudflare_zone_id: zoneId });
  return { apiToken, zoneId };
}

async function cloudflareFetch<T>(path: string, token: string, init?: RequestInit) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = await response.json().catch(() => ({})) as CloudflareResponse<T>;
  return { response, data };
}

export async function GET(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const settings = await readPortalSettings();
  const token = await readPrivateSetting("cloudflare_api_token");
  return NextResponse.json({
    configured: Boolean(token && settings.cloudflare_zone_id),
    tokenHint: token ? `••••${token.slice(-4)}` : null,
    zoneId: typeof settings.cloudflare_zone_id === "string" ? settings.cloudflare_zone_id : "",
    zoneName: typeof settings.cloudflare_zone_name === "string" ? settings.cloudflare_zone_name : "",
    zoneStatus: typeof settings.cloudflare_zone_status === "string" ? settings.cloudflare_zone_status : "",
    lastTestAt: typeof settings.cloudflare_last_test_at === "string" ? settings.cloudflare_last_test_at : "",
    lastPurgeAt: typeof settings.cloudflare_last_purge_at === "string" ? settings.cloudflare_last_purge_at : "",
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  try {
    const saved = await credentials(body, true);
    return NextResponse.json({ ok: true, configured: true, tokenHint: `••••${saved.apiToken.slice(-4)}`, zoneId: saved.zoneId });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível salvar a integração." }, { status: 400 }); }
}

export async function PUT(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  try {
    const { apiToken, zoneId } = await credentials(body, true);
    const [tokenCheck, zoneCheck] = await Promise.all([
      cloudflareFetch<{ status?: string }>("/user/tokens/verify", apiToken),
      cloudflareFetch<{ id: string; name: string; status?: string; paused?: boolean }>(`/zones/${zoneId}`, apiToken),
    ]);
    if (!tokenCheck.response.ok || !tokenCheck.data.success || tokenCheck.data.result?.status !== "active") return NextResponse.json({ error: apiError(tokenCheck.data, "O token não está ativo ou não pôde ser verificado.") }, { status: 400 });
    if (!zoneCheck.response.ok || !zoneCheck.data.success || !zoneCheck.data.result) return NextResponse.json({ error: apiError(zoneCheck.data, "O token não possui acesso à zona informada.") }, { status: 400 });
    const now = new Date().toISOString();
    await writePortalSettings({ cloudflare_zone_id: zoneId, cloudflare_zone_name: zoneCheck.data.result.name, cloudflare_zone_status: zoneCheck.data.result.status || "", cloudflare_last_test_at: now });
    return NextResponse.json({ ok: true, zoneName: zoneCheck.data.result.name, zoneStatus: zoneCheck.data.result.status || "", paused: zoneCheck.data.result.paused === true, testedAt: now });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível testar a Cloudflare." }, { status: 400 }); }
}

export async function PATCH(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (body.action !== "purge-cache") return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  try {
    const { apiToken, zoneId } = await credentials(body, false);
    const purge = await cloudflareFetch<{ id?: string }>(`/zones/${zoneId}/purge_cache`, apiToken, { method: "POST", body: JSON.stringify({ purge_everything: true }) });
    if (!purge.response.ok || !purge.data.success) return NextResponse.json({ error: apiError(purge.data, "A Cloudflare recusou a limpeza do cache.") }, { status: 400 });
    const now = new Date().toISOString();
    await writePortalSettings({ cloudflare_last_purge_at: now });
    return NextResponse.json({ ok: true, purgedAt: now, message: "Cache da zona limpo. A Cloudflare reconstruirá os arquivos conforme novos acessos." });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível sincronizar o cache." }, { status: 400 }); }
}

export const dynamic = "force-dynamic";
