import { NextResponse } from "next/server";
import { getCustomerBySessionToken, readCustomerCookie } from "../../../../../db/customer-auth";
import { addLiveSignal, getLiveSession, getPublicLiveSession, isLiveSessionOwner, listLiveSignals } from "../../../../../db/live";

const peerPattern = /^[a-zA-Z0-9-]{8,100}$/;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  const recipient = url.searchParams.get("recipient") || "";
  if (!peerPattern.test(recipient)) return NextResponse.json({ error: "Destinatário inválido." }, { status: 400 });
  const session = recipient === "host-live" ? await getLiveSession(id) : await getPublicLiveSession(id);
  if (!session || session.status !== "live") return NextResponse.json({ error: "Transmissão encerrada." }, { status: 404 });
  if (recipient === "host-live") {
    const user = await getCustomerBySessionToken(readCustomerCookie(request));
    if (!user || !await isLiveSessionOwner(id, user.id)) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }
  const after = Math.max(0, Number(url.searchParams.get("after") || 0));
  return NextResponse.json({ signals: await listLiveSignals(id, recipient, after) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = await request.json().catch(() => ({})) as { senderKey?: string; recipientKey?: string; kind?: string; payload?: unknown };
  const senderKey = String(payload.senderKey || "");
  const recipientKey = String(payload.recipientKey || "");
  const kind = payload.kind === "answer" ? "answer" : payload.kind === "ice" ? "ice" : "offer";
  if (!peerPattern.test(senderKey) || !peerPattern.test(recipientKey)) return NextResponse.json({ error: "Sinal inválido." }, { status: 400 });
  const session = senderKey === "host-live" ? await getLiveSession(id) : await getPublicLiveSession(id);
  if (!session || session.status !== "live") return NextResponse.json({ error: "Transmissão encerrada." }, { status: 404 });
  if (senderKey === "host-live") {
    const user = await getCustomerBySessionToken(readCustomerCookie(request));
    if (!user || !await isLiveSessionOwner(id, user.id)) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  } else if (recipientKey !== "host-live") return NextResponse.json({ error: "Destino inválido." }, { status: 400 });
  const serialized = JSON.stringify(payload.payload ?? null);
  if (serialized.length > 80_000) return NextResponse.json({ error: "Sinal excede o limite." }, { status: 413 });
  await addLiveSignal({ sessionId: id, senderKey, recipientKey, kind, payload: serialized });
  return NextResponse.json({ ok: true }, { status: 201 });
}
