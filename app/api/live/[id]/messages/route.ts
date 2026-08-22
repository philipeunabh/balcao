import { NextResponse } from "next/server";
import { getCustomerBySessionToken, readCustomerCookie } from "../../../../../db/customer-auth";
import { createLiveMessage, getPublicLiveSession, isLiveSessionOwner, listLiveMessages } from "../../../../../db/live";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getPublicLiveSession(id);
  if (!session || session.status !== "live") return NextResponse.json({ error: "Transmissão não encontrada." }, { status: 404 });
  const after = Math.max(0, Number(new URL(request.url).searchParams.get("after") || 0));
  return NextResponse.json({ messages: await listLiveMessages(id, after) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getPublicLiveSession(id);
  if (!session || session.status !== "live") return NextResponse.json({ error: "Transmissão não encontrada." }, { status: 404 });
  const payload = await request.json().catch(() => ({})) as { senderKey?: string; senderName?: string; message?: string };
  const senderKey = String(payload.senderKey || "").trim();
  const message = String(payload.message || "").trim().slice(0, 500);
  if (!/^[a-zA-Z0-9-]{8,100}$/.test(senderKey) || !message) return NextResponse.json({ error: "Mensagem inválida." }, { status: 400 });
  const user = await getCustomerBySessionToken(readCustomerCookie(request));
  const owner = Boolean(user && await isLiveSessionOwner(id, user.id));
  const senderName = owner ? user!.name : String(payload.senderName || "Visitante").trim().slice(0, 50) || "Visitante";
  const saved = await createLiveMessage({ sessionId: id, senderKey, senderName, senderRole: owner ? "store" : "visitor", message });
  if (!saved) return NextResponse.json({ error: "Aguarde antes de enviar outra mensagem." }, { status: 429 });
  return NextResponse.json({ message: saved }, { status: 201 });
}
