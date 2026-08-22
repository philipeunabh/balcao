import { NextResponse } from "next/server";
import { getAdminFromRequest } from "../../../../db/admin-auth";
import { OPENAI_MODEL, testOpenAIIntegration } from "../../../../db/openai";
import { readPortalSettings, readPrivateSetting, writePortalSettings } from "../../../../db/settings";

export async function GET(request: Request) {
  if (!(await getAdminFromRequest(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const settings = await readPortalSettings();
  return NextResponse.json({ configured: Boolean(settings.openai_api_key), model: OPENAI_MODEL, chatEnabled: settings.ai_chat_enabled !== false, chatPrompt: typeof settings.ai_chat_prompt === "string" ? settings.ai_chat_prompt : "" }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!(await getAdminFromRequest(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const payload = await request.json().catch(() => ({})) as { openai_api_key?: string; ai_chat_enabled?: boolean; ai_chat_prompt?: string };
  const currentKey = await readPrivateSetting("openai_api_key");
  if (!payload.openai_api_key?.trim() && !currentKey) return NextResponse.json({ error: "Informe a chave da OpenAI." }, { status: 400 });
  await writePortalSettings({ ...(payload.openai_api_key?.trim() ? { openai_api_key: payload.openai_api_key.trim() } : {}), ai_chat_enabled: payload.ai_chat_enabled !== false, ai_chat_prompt: (payload.ai_chat_prompt || "").trim().slice(0, 4_000) });
  return NextResponse.json({ ok: true, model: OPENAI_MODEL });
}

export async function PUT(request: Request) {
  if (!(await getAdminFromRequest(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const payload = await request.json().catch(() => ({})) as { openai_api_key?: string };
  try { return NextResponse.json(await testOpenAIIntegration(payload.openai_api_key)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao testar a OpenAI." }, { status: 400 }); }
}
