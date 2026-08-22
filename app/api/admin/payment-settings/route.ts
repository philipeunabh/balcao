import { NextResponse } from "next/server";
import { getAdminFromRequest } from "../../../../db/admin-auth";
import { readPrivateSetting, writePortalSettings } from "../../../../db/settings";
import { testPagBankIntegration, testPagBankPixPayment } from "../../../../db/pagbank";

export async function GET(request: Request) {
  if (!(await getAdminFromRequest(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const [token, email, environment, pixEnabled, cardEnabled] = await Promise.all([
    readPrivateSetting("pagbank_token"), readPrivateSetting("pagbank_email"), readPrivateSetting("pagbank_environment"),
    readPrivateSetting("pagbank_pix_enabled"), readPrivateSetting("pagbank_card_enabled"),
  ]);
  return NextResponse.json({ configured: { pagbank_token: Boolean(token) }, email, environment: environment || "sandbox", pixEnabled: String(pixEnabled) !== "false", cardEnabled: String(cardEnabled) !== "false" }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  if (!(await getAdminFromRequest(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const payload = await request.json().catch(() => ({})) as Record<string, unknown>; const values: Record<string, string | boolean> = {};
  if (typeof payload.pagbank_token === "string" && payload.pagbank_token.trim()) values.pagbank_token = payload.pagbank_token.trim();
  if (typeof payload.pagbank_email === "string" && payload.pagbank_email.trim()) values.pagbank_email = payload.pagbank_email.trim().toLowerCase();
  if (payload.pagbank_environment === "sandbox" || payload.pagbank_environment === "production") values.pagbank_environment = payload.pagbank_environment;
  if (typeof payload.pagbank_pix_enabled === "boolean") values.pagbank_pix_enabled = payload.pagbank_pix_enabled;
  if (typeof payload.pagbank_card_enabled === "boolean") values.pagbank_card_enabled = payload.pagbank_card_enabled;
  if (values.pagbank_pix_enabled === false && values.pagbank_card_enabled === false) return NextResponse.json({ error: "Ative Pix ou cartão." }, { status: 400 });
  if (!Object.keys(values).length) return NextResponse.json({ error: "Informe uma configuração do PagBank." }, { status: 400 });
  await writePortalSettings(values); return NextResponse.json({ ok: true });
}

export async function PUT(request: Request) {
  if (!(await getAdminFromRequest(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const payload = await request.json().catch(() => ({})) as { pagbank_token?: string; pagbank_environment?: string };
  try { return NextResponse.json(await testPagBankIntegration({ token: payload.pagbank_token, environment: payload.pagbank_environment })); }
  catch (error) {
    const code = error instanceof Error ? error.message : "";
    const message = code.includes(":401") || code.includes(":403") ? "O token não foi aceito pelo PagBank neste ambiente." : code.includes(":429") ? "O PagBank limitou temporariamente os testes. Aguarde e tente novamente." : "Não foi possível validar a conexão com o PagBank.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  if (!(await getAdminFromRequest(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const payload = await request.json().catch(() => ({})) as { pagbank_token?: string; pagbank_environment?: string };
  try {
    return NextResponse.json(await testPagBankPixPayment({ token: payload.pagbank_token, environment: payload.pagbank_environment }));
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const message = code.includes("REQUIRES_SANDBOX")
      ? "O teste de pagamento deve ser executado no ambiente Sandbox."
      : code.includes(":401") || code.includes(":403")
        ? "O token Sandbox não foi aceito pelo PagBank."
        : code.includes("PIX_RESPONSE_INVALID")
          ? "O PagBank não retornou o QR Code. Confirme se existe uma chave Pix ativa na conta."
          : "Não foi possível gerar o pagamento de teste no PagBank.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
