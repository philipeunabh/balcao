import { NextResponse } from "next/server";
import { getCustomerBySessionToken, readCustomerCookie } from "../../../../../../db/customer-auth";
import { listChatMessages, sendChatMessage } from "../../../../../../db/contact-chat";

async function customerFrom(request: Request) {
  return getCustomerBySessionToken(readCustomerCookie(request));
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const customer = await customerFrom(request);
  if (!customer) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const { id } = await params;
  const messages = await listChatMessages(id, customer.id);
  if (!messages) return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });
  return NextResponse.json({ messages }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const customer = await customerFrom(request);
  if (!customer) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { message?: unknown };
  const message = typeof body.message === "string" ? body.message.trim().replace(/\s+/g, " ") : "";
  if (!message || message.length > 2_000) return NextResponse.json({ error: "Digite uma mensagem de até 2.000 caracteres." }, { status: 400 });
  const { id } = await params;
  const saved = await sendChatMessage(id, customer.id, message);
  if (!saved) return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });
  return NextResponse.json({ message: saved }, { status: 201 });
}

export const dynamic = "force-dynamic";
