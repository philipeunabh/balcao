import { NextResponse } from "next/server";
import {
  CUSTOMER_SESSION_COOKIE,
  deleteCustomerSession,
  readCustomerCookie,
} from "../../../../db/customer-auth";

function clearSession(response: NextResponse) {
  response.cookies.set(CUSTOMER_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function GET(request: Request) {
  await deleteCustomerSession(readCustomerCookie(request));
  return clearSession(NextResponse.redirect(new URL("/", request.url)));
}

export async function POST(request: Request) {
  await deleteCustomerSession(readCustomerCookie(request));
  return clearSession(NextResponse.json({ ok: true }));
}
