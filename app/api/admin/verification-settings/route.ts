import { NextResponse } from "next/server";
import { getAdminFromRequest } from "../../../../db/admin-auth";
import { readPortalSettings, readPrivateSetting, writePortalSettings } from "../../../../db/settings";
import { sendWapiText, WapiRequestError } from "../../../../db/wapi";

const secretKeys = ["resend_api_key", "verification_email_from", "wapi_token"] as const;

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function phoneDigits(value: unknown) {
  return textValue(value).replace(/\D/g, "");
}

async function requireAdmin(request: Request) {
  return Boolean(await getAdminFromRequest(request));
}

export async function GET(request: Request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }
  const settings = await readPortalSettings();
  const configured = Object.fromEntries(await Promise.all(secretKeys.map(async (key) => [key, Boolean(await readPrivateSetting(key))])));
  return NextResponse.json({
    configured,
    enabled: settings.registration_code_enabled === true,
    instanceId: typeof settings.wapi_instance_id === "string" ? settings.wapi_instance_id : "",
    testWhatsapp: typeof settings.wapi_test_whatsapp === "string" ? settings.wapi_test_whatsapp : "",
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }
  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  const enabled = payload.registration_code_enabled === true;
  const token = textValue(payload.wapi_token);
  const storedToken = token || await readPrivateSetting("wapi_token");
  const instanceId = textValue(payload.wapi_instance_id) || await readPrivateSetting("wapi_instance_id");
  const testWhatsapp = phoneDigits(payload.wapi_test_whatsapp);

  if (enabled && (!storedToken || !instanceId)) {
    return NextResponse.json({ error: "Informe o token e o ID da instância da W-API antes de ativar o Send Code." }, { status: 400 });
  }
  if (testWhatsapp && (testWhatsapp.length < 10 || testWhatsapp.length > 13)) {
    return NextResponse.json({ error: "Informe um WhatsApp de teste válido, com DDD." }, { status: 400 });
  }

  const values: Record<string, unknown> = {
    registration_code_enabled: enabled,
    wapi_instance_id: instanceId,
    wapi_test_whatsapp: testWhatsapp,
  };
  for (const key of ["resend_api_key", "verification_email_from", "wapi_token"] as const) {
    const value = textValue(payload[key]);
    if (value) values[key] = value;
  }
  await writePortalSettings(values);
  return NextResponse.json({ ok: true, enabled, configured: Boolean(storedToken && instanceId) });
}

export async function PUT(request: Request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }
  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  const token = textValue(payload.wapi_token) || await readPrivateSetting("wapi_token");
  const instanceId = textValue(payload.wapi_instance_id) || await readPrivateSetting("wapi_instance_id");
  const whatsapp = phoneDigits(payload.wapi_test_whatsapp) || phoneDigits(await readPrivateSetting("wapi_test_whatsapp"));

  if (!token || !instanceId) {
    return NextResponse.json({ error: "Informe o token e o ID da instância da W-API." }, { status: 400 });
  }
  if (whatsapp.length < 10 || whatsapp.length > 13) {
    return NextResponse.json({ error: "Informe um WhatsApp de teste válido, com DDD." }, { status: 400 });
  }

  try {
    const result = await sendWapiText({
      token,
      instanceId,
      whatsapp,
      message: "Teste concluído: a integração Send Code do Portal Balcão está conectada à W-API.",
    });
    return NextResponse.json({ ok: true, messageId: result.messageId });
  } catch (error) {
    const status = error instanceof WapiRequestError && error.status >= 400 && error.status < 500 ? 400 : 502;
    const message = error instanceof Error ? error.message : "A W-API não respondeu ao teste.";
    return NextResponse.json({ error: message }, { status });
  }
}
