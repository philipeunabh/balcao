import { NextResponse } from "next/server";
import { readPortalSettings, writePortalSettings } from "../../../db/settings";
import { getAdminFromRequest } from "../../../db/admin-auth";

export async function GET() {
  const settings = await readPortalSettings();
  const privateKeys = new Set(["openai_api_key", "ai_chat_prompt", "google_maps_api", "mapbox_access_token", "resend_api_key", "verification_email_from", "whatsapp_access_token", "whatsapp_phone_number_id", "whatsapp_verify_template", "whatsapp_graph_version", "whatsapp_template_language", "wapi_token", "wapi_instance_id", "wapi_test_whatsapp", "registration_code_enabled", "pagbank_token", "pagbank_email", "pagbank_environment", "cloudflare_api_token", "smtp_host", "smtp_port", "smtp_secure", "smtp_username", "smtp_password", "smtp_from_name", "smtp_from_email", "smtp_reply_to"]);
  const publicSettings = Object.fromEntries(Object.entries(settings).filter(([key]) => !privateKeys.has(key)));
  return NextResponse.json({ ...publicSettings, pagbank_pix_enabled: settings.pagbank_pix_enabled !== false, pagbank_card_enabled: settings.pagbank_card_enabled !== false, has_openai_api_key: Boolean(settings.openai_api_key) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!(await getAdminFromRequest(request))) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }
  const payload = await request.json() as Record<string, unknown>;
  const allowed = Object.fromEntries(Object.entries(payload).filter(([key]) => ["banners", "discover_pages", "categories"].includes(key)));
  await writePortalSettings(allowed);
  return NextResponse.json({ ok: true });
}
