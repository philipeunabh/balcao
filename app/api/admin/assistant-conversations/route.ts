import { NextResponse } from "next/server";
import { getAdminFromRequest } from "../../../../db/admin-auth";
import { getAiChatSessionForAdmin, listAiChatSessions } from "../../../../db/ai-assistant";

export async function GET(request: Request) {
  if (!(await getAdminFromRequest(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") || "";
  if (id) {
    const conversation = await getAiChatSessionForAdmin(id);
    return conversation ? NextResponse.json(conversation, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });
  }
  return NextResponse.json({ conversations: await listAiChatSessions() }, { headers: { "Cache-Control": "no-store" } });
}
