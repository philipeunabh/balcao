import { NextResponse } from "next/server";
import { getAdminFromRequest } from "../../../../db/admin-auth";
import { readPortalSettings, writePortalSettings } from "../../../../db/settings";

const DEFAULT_WORDPRESS_API = "https://balcaonews.com.br";

async function authorized(request: Request) {
  return Boolean(await getAdminFromRequest(request));
}

function validHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const settings = await readPortalSettings();
  return NextResponse.json({ wordpressApi: typeof settings.wordpress_api_url === "string" && settings.wordpress_api_url ? settings.wordpress_api_url : DEFAULT_WORDPRESS_API }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const payload = await request.json().catch(() => ({})) as { wordpressApi?: string };
  const wordpressApi = payload.wordpressApi?.trim() || "";
  if (!wordpressApi || !validHttpUrl(wordpressApi)) return NextResponse.json({ error: "Informe uma URL válida do WordPress." }, { status: 400 });
  await writePortalSettings({ wordpress_api_url: wordpressApi });
  return NextResponse.json({ ok: true, wordpressApi }, { headers: { "Cache-Control": "no-store" } });
}
