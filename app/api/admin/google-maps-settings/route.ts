import { NextResponse } from "next/server";
import { getAdminFromRequest } from "../../../../db/admin-auth";
import { readPrivateSetting, writePortalSettings } from "../../../../db/settings";

async function authorized(request: Request) { return Boolean(await getAdminFromRequest(request)); }

export async function GET(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const key = await readPrivateSetting("google_maps_api");
  return NextResponse.json({ configured: Boolean(key), keyHint: key ? `••••${key.slice(-4)}` : null }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const payload = await request.json().catch(() => ({})) as { google_maps_api?: string };
  const key = payload.google_maps_api?.trim() || "";
  if (key.length < 20) return NextResponse.json({ error: "Informe uma chave válida da API do Google Maps." }, { status: 400 });
  await writePortalSettings({ google_maps_api: key });
  const saved = await readPrivateSetting("google_maps_api");
  if (saved !== key) return NextResponse.json({ error: "A chave não pôde ser confirmada após o salvamento." }, { status: 500 });
  return NextResponse.json({ ok: true, configured: true, keyHint: `••••${saved.slice(-4)}` });
}

export async function PUT(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const payload = await request.json().catch(() => ({})) as { google_maps_api?: string };
  const submittedKey = payload.google_maps_api?.trim() || "";
  if (submittedKey) {
    if (submittedKey.length < 20) return NextResponse.json({ error: "Informe uma chave válida da API do Google Maps." }, { status: 400 });
    await writePortalSettings({ google_maps_api: submittedKey });
  }
  const apiKey = submittedKey || await readPrivateSetting("google_maps_api");
  if (!apiKey) return NextResponse.json({ error: "Configure a chave da API do Google Maps." }, { status: 400 });
  const saved = await readPrivateSetting("google_maps_api");
  if (saved !== apiKey) return NextResponse.json({ error: "A chave não pôde ser confirmada após o salvamento." }, { status: 500 });
  return NextResponse.json({ ok: true, configured: true, keyHint: `••••${apiKey.slice(-4)}` }, { headers: { "Cache-Control": "no-store" } });
}
