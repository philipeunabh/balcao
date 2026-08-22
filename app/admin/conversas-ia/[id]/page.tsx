import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ADMIN_SESSION_COOKIE, getAdminBySessionToken } from "../../../../db/admin-auth";
import { getAiChatSessionForAdmin } from "../../../../db/ai-assistant";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conversa do Assistente | Portal Balcão", robots: { index: false, follow: false } };

export default async function AiConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminBySessionToken((await cookies()).get(ADMIN_SESSION_COOKIE)?.value);
  if (!admin) redirect("/admin/login");
  const { id } = await params; const conversation = await getAiChatSessionForAdmin(id);
  if (!conversation) notFound();
  const session = conversation.session as { ipAddress?: string; userAgent?: string; customerName?: string; customerEmail?: string; consentAt?: string };
  return <main className="assistant-transcript-page"><header><div><a href="/admin">← Dashboard</a><span>Atendimento com IA</span><h1>{session.customerName || "Visitante não identificado"}</h1><p>{session.customerEmail || "Sem conta vinculada"} · IP {session.ipAddress || "indisponível"}</p></div><aside><span>Consentimento</span><strong>{session.consentAt ? new Date(session.consentAt).toLocaleString("pt-BR") : "Não informado"}</strong><small>{session.userAgent || "Navegador não identificado"}</small></aside></header><section className="assistant-transcript">{conversation.messages.map((message) => <article className={message.role} key={message.id}><header><strong>{message.role === "user" ? "Visitante" : message.role === "assistant" ? "Assistente Balcão" : "Sistema"}</strong><time>{new Date(message.createdAt).toLocaleString("pt-BR")}</time></header><p>{message.body}</p>{Array.isArray(message.metadata.listings) ? <div className="assistant-transcript-results">{(message.metadata.listings as Array<{ id: string; title: string; url: string; priceLabel: string }>).map((listing) => <a href={listing.url} target="_blank" key={listing.id}>{listing.title}<strong>{listing.priceLabel}</strong></a>)}</div> : null}</article>)}</section></main>;
}
