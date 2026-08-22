import { NextResponse } from "next/server";
import { getCustomerBySessionToken, readCustomerCookie } from "../../../../db/customer-auth";
import { deleteSavedCard, listSavedCards } from "../../../../db/saved-cards";

export async function GET(request: Request) {
  const customer = await getCustomerBySessionToken(readCustomerCookie(request));
  if (!customer) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  return NextResponse.json({ cards: await listSavedCards(customer.id) }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
  const customer = await getCustomerBySessionToken(readCustomerCookie(request));
  if (!customer) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "Cartão inválido." }, { status: 400 });
  await deleteSavedCard(id, customer.id);
  return NextResponse.json({ ok: true });
}
