import { NextResponse } from "next/server";
import { getCustomerBySessionToken, readCustomerCookie } from "../../../../db/customer-auth";
import { listChatConversations, startChatConversation } from "../../../../db/contact-chat";

async function customerFrom(request: Request) {
  return getCustomerBySessionToken(readCustomerCookie(request));
}

export async function GET(request: Request) {
  const customer = await customerFrom(request);
  if (!customer) return NextResponse.json({ error: "Entre na sua conta para acessar o chat." }, { status: 401 });
  return NextResponse.json({ conversations: await listChatConversations(customer.id) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const customer = await customerFrom(request);
  if (!customer) return NextResponse.json({ error: "Entre na sua conta para conversar com o anunciante." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { listingId?: unknown };
  const listingId = typeof body.listingId === "string" ? body.listingId.trim() : "";
  if (!listingId) return NextResponse.json({ error: "Anúncio inválido." }, { status: 400 });
  const result = await startChatConversation(listingId, customer.id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ conversationId: result.id }, { status: 201 });
}

export const dynamic = "force-dynamic";
