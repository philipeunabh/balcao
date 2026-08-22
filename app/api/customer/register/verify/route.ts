import { NextResponse } from "next/server";
import {
  CUSTOMER_SESSION_COOKIE,
  createCustomerSession,
  onlyDigits,
  verifyPendingRegistration,
} from "../../../../../db/customer-auth";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({})) as { registrationId?: unknown; code?: unknown };
  const registrationId = typeof payload.registrationId === "string" ? payload.registrationId : "";
  const code = typeof payload.code === "string" ? onlyDigits(payload.code) : "";
  if (!registrationId || code.length !== 4) {
    return NextResponse.json({ error: "Digite o código de 4 números." }, { status: 400 });
  }
  const result = await verifyPendingRegistration(registrationId, code);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  const session = await createCustomerSession(result.userId, true);
  const response = NextResponse.json({ ok: true, redirect: "/anunciar" });
  response.cookies.set(CUSTOMER_SESSION_COOKIE, session.token, {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: session.maxAge,
  });
  return response;
}
