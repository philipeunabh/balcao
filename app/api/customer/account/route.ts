import { NextResponse } from "next/server";
import {
  getCustomerBySessionToken,
  readCustomerCookie,
} from "../../../../db/customer-auth";
import {
  createCustomerTicket,
  getCustomerTickets,
  updateCustomerProfile,
} from "../../../../db/customer-account";

async function authenticatedCustomer(request: Request) {
  return getCustomerBySessionToken(readCustomerCookie(request));
}

export async function GET(request: Request) {
  const customer = await authenticatedCustomer(request);
  if (!customer) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  return NextResponse.json({ customer, tickets: await getCustomerTickets(customer.id) });
}

export async function PATCH(request: Request) {
  const customer = await authenticatedCustomer(request);
  if (!customer) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { name?: string; whatsapp?: string; profileImageUrl?: string | null };
  const name = String(body.name || "").trim();
  const whatsapp = String(body.whatsapp || "").replace(/\D/g, "");
  const profileImageUrl = String(body.profileImageUrl || "").trim() || null;
  if (name.length < 3) return NextResponse.json({ error: "Informe seu nome completo." }, { status: 400 });
  if (whatsapp.replace(/\D/g, "").length < 10) {
    return NextResponse.json({ error: "Informe um WhatsApp válido." }, { status: 400 });
  }
  if (profileImageUrl && !profileImageUrl.startsWith("/api/media/")) {
    return NextResponse.json({ error: "A foto do perfil é inválida." }, { status: 400 });
  }
  return NextResponse.json({ customer: await updateCustomerProfile(customer, { name, whatsapp, profileImageUrl }) });
}

export async function POST(request: Request) {
  const customer = await authenticatedCustomer(request);
  if (!customer) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { action?: string; subject?: string; message?: string };
  if (body.action !== "ticket") return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  const subject = String(body.subject || "").trim();
  const message = String(body.message || "").trim();
  if (subject.length < 3 || message.length < 10) {
    return NextResponse.json({ error: "Informe o assunto e descreva sua solicitação." }, { status: 400 });
  }
  return NextResponse.json({ ticket: await createCustomerTicket(customer.id, subject, message) }, { status: 201 });
}

export const dynamic = "force-dynamic";
