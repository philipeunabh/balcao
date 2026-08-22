import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  changeAdminPassword,
  getAdminFromRequest,
} from "../../../../db/admin-auth";

export async function POST(request: Request) {
  const admin = await getAdminFromRequest(request);
  if (!admin) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const payload = await request.json().catch(() => ({})) as { password?: unknown };
  if (typeof payload.password !== "string" || payload.password.length < 10) {
    return NextResponse.json({ error: "A senha deve ter pelo menos 10 caracteres." }, { status: 400 });
  }
  await changeAdminPassword(admin.id, payload.password);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
