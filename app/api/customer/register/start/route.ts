import { NextResponse } from "next/server";
import {
  CUSTOMER_SESSION_COOKIE,
  createCustomerSession,
  createCustomerWithoutVerification,
  createPendingRegistration,
  deletePendingRegistration,
  findCustomerDuplicate,
  isValidCnpj,
  isValidCpf,
  onlyDigits,
} from "../../../../../db/customer-auth";
import {
  getVerificationChannels,
  sendVerificationCode,
} from "../../../../../db/verification-delivery";

type RegistrationPayload = {
  accountType?: unknown;
  taxId?: unknown;
  email?: unknown;
  name?: unknown;
  whatsapp?: unknown;
  password?: unknown;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({})) as RegistrationPayload;
  const accountType = payload.accountType === "empresa" ? "empresa" : payload.accountType === "particular" ? "particular" : null;
  const taxId = typeof payload.taxId === "string" ? onlyDigits(payload.taxId) : "";
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const name = typeof payload.name === "string" ? payload.name.trim().replace(/\s+/g, " ") : "";
  const whatsapp = typeof payload.whatsapp === "string" ? onlyDigits(payload.whatsapp) : "";
  const password = typeof payload.password === "string" ? payload.password : "";

  if (!accountType) return NextResponse.json({ error: "Escolha Particular ou Empresa." }, { status: 400 });
  const validTaxId = accountType === "particular" ? isValidCpf(taxId) : isValidCnpj(taxId);
  if (!validTaxId) return NextResponse.json({ error: `${accountType === "particular" ? "CPF" : "CNPJ"} inválido.` }, { status: 400 });
  if (!emailPattern.test(email)) return NextResponse.json({ error: "Informe um e-mail válido." }, { status: 400 });
  if (name.length < 3 || name.length > 120) return NextResponse.json({ error: "Informe o nome completo ou a razão social." }, { status: 400 });
  if (whatsapp.length < 10 || whatsapp.length > 13) return NextResponse.json({ error: "Informe um WhatsApp válido com DDD." }, { status: 400 });
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return NextResponse.json({ error: "A senha deve ter pelo menos 8 caracteres, com letras e números." }, { status: 400 });
  }

  const duplicate = await findCustomerDuplicate(email, taxId);
  if (duplicate) {
    return NextResponse.json(
      { error: duplicate.taxId === taxId ? "CPF/CNPJ já cadastrado." : "E-mail já cadastrado." },
      { status: 409 },
    );
  }

  const channels = await getVerificationChannels();
  if (!channels.enabled) {
    const customer = await createCustomerWithoutVerification({ accountType, taxId, email, name, whatsapp, password });
    const session = await createCustomerSession(customer.userId, true);
    const response = NextResponse.json({ ok: true, verificationRequired: false, redirect: "/anunciar" });
    response.cookies.set(CUSTOMER_SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: new URL(request.url).protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: session.maxAge,
    });
    return response;
  }

  if (!channels.email && !channels.whatsapp) {
    return NextResponse.json({ error: "O envio de código está ativo, mas a W-API ainda não foi configurada. Tente novamente mais tarde." }, { status: 503 });
  }

  const pending = await createPendingRegistration({ accountType, taxId, email, name, whatsapp, password });
  try {
    const deliveryChannels = await sendVerificationCode({ email, name, whatsapp, code: pending.code });
    if (!deliveryChannels.length) {
      await deletePendingRegistration(pending.id);
      return NextResponse.json({ error: "Não foi possível enviar o código pelo WhatsApp. Confira o número e tente novamente." }, { status: 502 });
    }
    return NextResponse.json({
      ok: true,
      verificationRequired: true,
      registrationId: pending.id,
      expiresAt: pending.expiresAt,
      email,
      whatsapp,
      deliveryChannels,
    });
  } catch {
    await deletePendingRegistration(pending.id);
    return NextResponse.json({ error: "O serviço de envio não respondeu. Aguarde um instante e tente novamente." }, { status: 502 });
  }
}
