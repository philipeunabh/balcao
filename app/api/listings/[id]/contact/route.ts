import { NextResponse } from "next/server";
import { getCustomerBySessionToken, readCustomerCookie } from "../../../../../db/customer-auth";
import { getListingContact, hasListingContactEvent, recordListingContact, saveListingProposal } from "../../../../../db/contact-chat";
import { sendListingProposal } from "../../../../../db/verification-delivery";

const VISITOR_COOKIE = "balcao_contact_visitor";

function cookieValue(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie") || "";
  for (const part of cookieHeader.split(";")) {
    const [cookieName, ...value] = part.trim().split("=");
    if (cookieName === name) return decodeURIComponent(value.join("="));
  }
  return "";
}

function localPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
}

function maskedPhone(value: string) {
  const digits = localPhone(value);
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-XXX`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-XXX`;
  return "Telefone indisponível";
}

function formattedPhone(value: string) {
  const digits = localPhone(value);
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return digits;
}

function whatsappPhone(value: string) {
  const digits = localPhone(value);
  return `55${digits}`;
}

async function actor(request: Request) {
  const customer = await getCustomerBySessionToken(readCustomerCookie(request));
  if (customer) return { key: `user:${customer.id}`, userId: customer.id, visitorId: "" };
  const current = cookieValue(request, VISITOR_COOKIE);
  return { key: `visitor:${current || crypto.randomUUID()}`, userId: null, visitorId: current };
}

function setVisitorCookie(request: Request, response: NextResponse, actorValue: Awaited<ReturnType<typeof actor>>) {
  if (actorValue.userId || actorValue.visitorId) return;
  const id = actorValue.key.slice("visitor:".length);
  response.cookies.set(VISITOR_COOKIE, id, { httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "lax", path: "/", maxAge: 365 * 24 * 60 * 60 });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = await getListingContact(id);
  if (!contact || !/^\d{10,13}$/.test(contact.whatsapp.replace(/\D/g, ""))) {
    return NextResponse.json({ error: "Contato do anúncio indisponível." }, { status: 404 });
  }
  const actorValue = await actor(request);
  const whatsappUsed = await hasListingContactEvent(contact.listingId, actorValue.key, "whatsapp_click");
  return NextResponse.json({ maskedPhone: maskedPhone(contact.whatsapp), whatsappUsed, isOwner: actorValue.userId === contact.ownerUserId }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as { action?: unknown; name?: unknown; email?: unknown; phone?: unknown; message?: unknown };
  const contact = await getListingContact(id);
  if (!contact || !/^\d{10,13}$/.test(contact.whatsapp.replace(/\D/g, ""))) {
    return NextResponse.json({ error: "Contato do anúncio indisponível." }, { status: 404 });
  }
  const actorValue = await actor(request);
  if (body.action === "view") {
    if (actorValue.userId !== contact.ownerUserId) await recordListingContact({ listingId: contact.listingId, ownerUserId: contact.ownerUserId, actorKey: actorValue.key, actorUserId: actorValue.userId, eventType: "detail_view" });
    const response = NextResponse.json({ recorded: true });
    setVisitorCookie(request, response, actorValue);
    return response;
  }
  if (body.action === "phone") {
    if (actorValue.userId !== contact.ownerUserId) await recordListingContact({ listingId: contact.listingId, ownerUserId: contact.ownerUserId, actorKey: actorValue.key, actorUserId: actorValue.userId, eventType: "phone_reveal" });
    const response = NextResponse.json({ phone: formattedPhone(contact.whatsapp) });
    setVisitorCookie(request, response, actorValue);
    return response;
  }
  if (body.action === "whatsapp") {
    if (actorValue.userId === contact.ownerUserId) return NextResponse.json({ error: "Este anúncio pertence à sua conta." }, { status: 409 });
    const inserted = await recordListingContact({ listingId: contact.listingId, ownerUserId: contact.ownerUserId, actorKey: actorValue.key, actorUserId: actorValue.userId, eventType: "whatsapp_click" });
    if (!inserted) return NextResponse.json({ error: "O contato pelo WhatsApp já foi iniciado para este anúncio.", alreadyUsed: true }, { status: 409 });
    const message = `Olá, vi seu anúncio no site do Jornal Balcão. ${contact.title} — ${contact.priceLabel}. Gostaria de saber mais informações. Podemos conversar?`;
    const url = `https://api.whatsapp.com/send?phone=${encodeURIComponent(whatsappPhone(contact.whatsapp))}&text=${encodeURIComponent(message)}`;
    const response = NextResponse.json({ url });
    setVisitorCookie(request, response, actorValue);
    return response;
  }
  if (body.action === "chat") {
    if (actorValue.userId !== contact.ownerUserId) await recordListingContact({ listingId: contact.listingId, ownerUserId: contact.ownerUserId, actorKey: actorValue.key, actorUserId: actorValue.userId, eventType: "chat_start" });
    const response = NextResponse.json({ recorded: true });
    setVisitorCookie(request, response, actorValue);
    return response;
  }
  if (body.action === "proposal") {
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 180) : "";
    const phone = typeof body.phone === "string" ? body.phone.trim().slice(0, 30) : "";
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 3000) : "";
    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || message.length < 10) {
      return NextResponse.json({ error: "Preencha nome, e-mail válido e uma proposta com pelo menos 10 caracteres." }, { status: 400 });
    }
    if (!contact.ownerEmail) return NextResponse.json({ error: "Este anunciante ainda não possui e-mail disponível para receber propostas." }, { status: 422 });
    await saveListingProposal({ listingId: contact.listingId, ownerUserId: contact.ownerUserId, name, email, phone, message });
    const emailSent = await sendListingProposal({ email: contact.ownerEmail, advertiserName: contact.ownerName || "Anunciante", listingId: contact.listingId, listingTitle: contact.title, senderName: name, senderEmail: email, senderPhone: phone, message }).then(() => true).catch(() => false);
    await recordListingContact({ listingId: contact.listingId, ownerUserId: contact.ownerUserId, actorKey: actorValue.key, actorUserId: actorValue.userId, eventType: "proposal_submit" });
    const response = NextResponse.json({ sent: true, emailSent }, { status: 201 });
    setVisitorCookie(request, response, actorValue);
    return response;
  }
  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
}

export const dynamic = "force-dynamic";
