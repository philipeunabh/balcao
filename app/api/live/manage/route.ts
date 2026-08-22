import { NextResponse } from "next/server";
import { getCustomerBySessionToken, readCustomerCookie } from "../../../../db/customer-auth";
import { createLiveSession, endLiveSession, getActiveLiveSessionForUser, touchActiveLiveSession } from "../../../../db/live";

async function customer(request: Request) { return getCustomerBySessionToken(readCustomerCookie(request)); }

export async function GET(request: Request) {
  const user = await customer(request);
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  return NextResponse.json({ session: await getActiveLiveSessionForUser(user.id) });
}

export async function POST(request: Request) {
  const user = await customer(request);
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const payload = await request.json().catch(() => ({})) as { title?: string; description?: string };
  const title = String(payload.title || "").trim().slice(0, 100);
  const description = String(payload.description || "").trim().slice(0, 500);
  if (title.length < 5) return NextResponse.json({ error: "Informe um título com pelo menos 5 caracteres." }, { status: 400 });
  const session = await createLiveSession(user.id, title, description);
  if (!session) return NextResponse.json({ error: "A transmissão ao vivo exige uma loja virtual ativa e dentro da vigência do plano." }, { status: 403 });
  return NextResponse.json({ session }, { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await customer(request);
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  if (!await touchActiveLiveSession(user.id)) return NextResponse.json({ error: "Transmissão não encontrada." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await customer(request);
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!id || !await endLiveSession(id, user.id)) return NextResponse.json({ error: "Transmissão não encontrada." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
