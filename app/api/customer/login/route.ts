import { NextResponse } from "next/server";
import {
  CUSTOMER_SESSION_COOKIE,
  authenticateCustomer,
  createCustomerSession,
} from "../../../../db/customer-auth";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({})) as { email?: unknown; password?: unknown; remember?: unknown };
  if (typeof payload.email !== "string" || typeof payload.password !== "string") {
    return NextResponse.json({ error: "Informe o e-mail e a senha." }, { status: 400 });
  }
  const customer = await authenticateCustomer(payload.email, payload.password);
  if (!customer) return NextResponse.json({ error: "E-mail ou senha incorretos." }, { status: 401 });
  const session = await createCustomerSession(customer.id, payload.remember === true);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(CUSTOMER_SESSION_COOKIE, session.token, {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: session.maxAge,
  });
  return response;
}
