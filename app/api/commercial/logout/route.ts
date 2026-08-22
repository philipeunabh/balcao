import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, deleteAdminSession, readAdminCookie } from "../../../../db/admin-auth";

export async function POST(request: Request) {
  await deleteAdminSession(readAdminCookie(request));
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
