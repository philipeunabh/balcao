import { NextResponse } from "next/server";
import { aiChatSessionExists, appendAiChatMessage, ensureAiChatSession, listAiChatMessages, searchAiChatListings, visitorIp } from "../../../../db/ai-assistant";
import { getCustomerBySessionToken, readCustomerCookie } from "../../../../db/customer-auth";
import { chatWithPortalVisitor } from "../../../../db/openai";
import { readPortalSettings } from "../../../../db/settings";

const AI_CHAT_COOKIE = "balcao_ai_chat";

function readSessionCookie(request: Request) {
  return request.headers.get("cookie")?.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${AI_CHAT_COOKIE}=`))?.slice(AI_CHAT_COOKIE.length + 1) || "";
}

function setSessionCookie(response: NextResponse, request: Request, id: string) {
  response.cookies.set(AI_CHAT_COOKIE, id, { httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 90 });
}

async function customerForRequest(request: Request) {
  return getCustomerBySessionToken(readCustomerCookie(request));
}

export async function GET(request: Request) {
  const sessionId = readSessionCookie(request);
  const customer = await customerForRequest(request);
  if (!sessionId || !(await aiChatSessionExists(sessionId))) return NextResponse.json({ started: false, messages: [], customerAuthenticated: Boolean(customer) }, { headers: { "Cache-Control": "no-store" } });
  if (customer) await ensureAiChatSession({ id: sessionId, ipAddress: visitorIp(request), userAgent: request.headers.get("user-agent") || "", customerUserId: customer.id });
  return NextResponse.json({ started: true, messages: await listAiChatMessages(sessionId), customerAuthenticated: Boolean(customer) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const settings = await readPortalSettings();
  if (settings.ai_chat_enabled === false) return NextResponse.json({ error: "O atendimento com IA está temporariamente indisponível." }, { status: 503 });
  const payload = await request.json().catch(() => ({})) as { message?: unknown; consent?: unknown };
  const message = typeof payload.message === "string" ? payload.message.trim().replace(/\s+/g, " ").slice(0, 1_500) : "";
  if (!message) return NextResponse.json({ error: "Digite uma mensagem." }, { status: 400 });
  let sessionId = readSessionCookie(request);
  const exists = sessionId && await aiChatSessionExists(sessionId);
  if (!exists && payload.consent !== true) return NextResponse.json({ error: "Confirme o aviso de privacidade para iniciar o atendimento." }, { status: 400 });
  if (!exists) sessionId = crypto.randomUUID();
  const customer = await customerForRequest(request);
  await ensureAiChatSession({ id: sessionId, ipAddress: visitorIp(request), userAgent: request.headers.get("user-agent") || "", customerUserId: customer?.id });
  const userMessage = await appendAiChatMessage(sessionId, "user", message);
  const normalized = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  let reply = "";
  let action: "register" | "listing" | null = null;
  let nextAction: "listing" | null = null;
  let intent = "general";
  let listings = [] as Awaited<ReturnType<typeof searchAiChatListings>>;

  if (/\b(criar|fazer|abrir|cadastrar)\b.{0,18}\b(conta|cadastro|usuario)\b|\bme cadastrar\b/.test(normalized)) {
    intent = "register"; action = "register";
    reply = customer ? "Sua conta já está conectada. Posso ajudar a cadastrar um anúncio." : "Abra o formulário protegido abaixo para criar sua conta. Senha e código de confirmação não são enviados à IA nem gravados como mensagem.";
  } else if (/\b(criar|cadastrar|publicar|fazer)\b.{0,18}\banuncio\b|\bquero anunciar\b/.test(normalized)) {
    intent = "listing"; action = customer ? "listing" : "register";
    nextAction = customer ? null : "listing";
    reply = customer ? "Preencha o formulário abaixo. Ao final, você poderá escolher anúncio grátis, destacado ou super destacado." : "Primeiro vou validar CPF, e-mail e celular/WhatsApp. Se a conta já existir, basta confirmar a senha; se não existir, o cadastro será criado antes de abrir o formulário do anúncio.";
  } else {
    listings = await searchAiChatListings(message, 5);
    if (listings.length) {
      intent = "search";
      reply = `Encontrei ${listings.length} anúncio${listings.length === 1 ? "" : "s"} relacionado${listings.length === 1 ? "" : "s"}. Confira os resultados abaixo.`;
    } else {
      const history = await listAiChatMessages(sessionId, 14);
      try {
        reply = await chatWithPortalVisitor({ prompt: typeof settings.ai_chat_prompt === "string" ? settings.ai_chat_prompt : undefined, messages: history.filter((item) => item.role !== "system").map((item) => ({ role: item.role === "user" ? "user" as const : "assistant" as const, content: item.body })) });
      } catch {
        reply = "Posso buscar anúncios, ajudar a criar uma conta ou iniciar o cadastro de um anúncio. Digite o que você procura.";
      }
    }
  }

  const assistantMessage = await appendAiChatMessage(sessionId, "assistant", reply, intent, { action, listings });
  const response = NextResponse.json({ ok: true, messages: [userMessage, assistantMessage], reply, action, nextAction, listings, customerAuthenticated: Boolean(customer) });
  setSessionCookie(response, request, sessionId);
  return response;
}

export async function PUT(request: Request) {
  const sessionId = readSessionCookie(request);
  if (!sessionId || !(await aiChatSessionExists(sessionId))) return NextResponse.json({ error: "Conversa não iniciada." }, { status: 400 });
  const payload = await request.json().catch(() => ({})) as { event?: unknown; listingId?: unknown };
  const customer = await customerForRequest(request);
  if (customer) await ensureAiChatSession({ id: sessionId, ipAddress: visitorIp(request), userAgent: request.headers.get("user-agent") || "", customerUserId: customer.id });
  let body = "";
  let metadata: Record<string, unknown> = {};
  if (payload.event === "registration_completed" && customer) body = "Cadastro concluído e conta conectada ao atendimento.";
  if (payload.event === "listing_created" && customer && typeof payload.listingId === "string") {
    const { env } = await import("cloudflare:workers");
    const listing = await env.DB.prepare("SELECT id, title FROM portal_listings WHERE id=? AND user_id=? LIMIT 1").bind(payload.listingId, customer.id).first<{ id: string; title: string }>();
    if (listing) { body = `Anúncio “${listing.title}” cadastrado e enviado para aprovação.`; metadata = { listingId: listing.id, url: `/anuncio/${encodeURIComponent(listing.id)}` }; }
  }
  if (!body) return NextResponse.json({ error: "Evento inválido." }, { status: 400 });
  const message = await appendAiChatMessage(sessionId, "assistant", body, String(payload.event || "event"), metadata);
  return NextResponse.json({ ok: true, message });
}
