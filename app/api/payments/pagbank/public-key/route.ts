import { NextResponse } from "next/server";
import { getCustomerBySessionToken, readCustomerCookie } from "../../../../../db/customer-auth";
import { getPagBankPublicKey } from "../../../../../db/pagbank";

export async function GET(request: Request) {
  const customer = await getCustomerBySessionToken(readCustomerCookie(request));
  if (!customer) return NextResponse.json({ error: "Entre na sua conta para pagar." }, { status: 401 });
  try {
    const publicKey = await getPagBankPublicKey();
    return NextResponse.json({ publicKey }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch {
    return NextResponse.json({ error: "A integração de cartão do PagBank não está disponível." }, { status: 503 });
  }
}

export const dynamic = "force-dynamic";
