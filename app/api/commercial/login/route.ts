import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  authenticateCommercial,
  clearLoginFailures,
  createAdminSession,
  createLoginAttemptKey,
  isLoginBlocked,
  recordLoginFailure,
} from "../../../../db/admin-auth";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({})) as { email?: unknown; password?: unknown; remember?: unknown };
  if (typeof payload.email !== "string" || typeof payload.password !== "string") {
    return NextResponse.json({ error: "Informe o e-mail e a senha." }, { status: 400 });
  }
  const attemptKey = await createLoginAttemptKey(request, payload.email);
  if (await isLoginBlocked(attemptKey)) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde 15 minutos e tente novamente." }, { status: 429 });
  }
  const commercial = await authenticateCommercial(payload.email, payload.password);
  if (!commercial) {
    await recordLoginFailure(attemptKey);
    return NextResponse.json({ error: "E-mail ou senha incorretos." }, { status: 401 });
  }
  await clearLoginFailures(attemptKey);
  const session = await createAdminSession(commercial.id, payload.remember === true);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, session.token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: session.maxAge,
  });
  return response;
}
