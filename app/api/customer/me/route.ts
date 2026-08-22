import { NextResponse } from "next/server";
import { getCustomerBySessionToken, readCustomerCookie } from "../../../../db/customer-auth";
export async function GET(request: Request) {
  const customer = await getCustomerBySessionToken(readCustomerCookie(request));
  if (!customer) return NextResponse.json({ authenticated: false }, { status: 401 });
  return NextResponse.json({ authenticated: true, customer: { name: customer.name, email: customer.email, whatsapp: customer.whatsapp,
    planName: customer.planName, adLimit: customer.adLimit, activeAds: customer.activeAds, remainingAds: Math.max(0, customer.adLimit - customer.activeAds) } },
    { headers: { "Cache-Control": "no-store" } });
}
