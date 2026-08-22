import { NextResponse } from "next/server";
import { getAdminFromRequest } from "../../../../db/admin-auth";
import { chatWithListingAgent, editListingImageWithOpenAI, reviewListingWithOpenAI } from "../../../../db/openai";
import { adminApproveAllPendingListings, adminUpdateListing, findStoredListingById, listStoredListings, type StoredListing } from "../../../../db/listings";
import { readPortalSettings, writePortalSettings } from "../../../../db/settings";

export const dynamic = "force-dynamic";

const DEFAULT_AI_REVIEWER_PROMPT = `Você é o Revisor com IA do Portal Balcão, um assistente editorial e operacional para anúncios classificados.

Suas responsabilidades:
1. Localizar anúncios pelo título, código ou URL informada pelo administrador.
2. Listar anúncios pendentes de aprovação quando solicitado.
3. Nunca aprovar, publicar ou alterar anúncios sem mostrar antes o que será feito e pedir confirmação explícita.
4. Revisar títulos e gerar versões profissionais, naturais e otimizadas para SEO, com no máximo 60 caracteres.
5. Reescrever descrições em português do Brasil, mantendo somente as informações reais do anúncio, sem inventar preço, estado, opcionais, características ou condições.
6. Analisar a imagem principal e, quando solicitado, preparar uma versão tecnicamente melhor, corrigindo nitidez, iluminação, ruído, enquadramento e cores, sem modificar o produto, veículo, imóvel, pessoa, marca ou cenário real.
7. Mostrar sempre o rascunho final de título, descrição e imagem para aprovação antes de publicar as alterações.
8. Responder de forma objetiva, profissional e explicar qual será o próximo passo.
9. Se o pedido estiver ambíguo, perguntar qual anúncio e qual alteração o administrador deseja.
10. Para ações em lote, informar a quantidade de anúncios afetados e exigir confirmação.`;

async function authorized(request: Request) { return Boolean(await getAdminFromRequest(request)); }
function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR"); }
function publicListing(row: StoredListing) {
  const images = (() => { try { return JSON.parse(row.imagesJson || "[]") as string[]; } catch { return []; } })();
  return { id: row.id, title: row.title, description: row.description, category: row.category, subcategory: row.subcategory, status: row.status, image: row.coverImage || images[0] || "/favicon.svg", images, location: row.address };
}
function listingIdFromText(message: string) {
  const match = message.match(/\/anuncio\/([^\s?#/]+)/i); return match ? decodeURIComponent(match[1]) : "";
}
async function findListing(query: string, preferredId?: string) {
  if (preferredId) { const preferred = await findStoredListingById(preferredId, true); if (preferred) return preferred; }
  const fromUrl = listingIdFromText(query); if (fromUrl) { const row = await findStoredListingById(fromUrl, true); if (row) return row; }
  const all = await listStoredListings(true); const needle = normalize(query).replace(/\b(quero|corrigir|revisar|alterar|anuncio|anúncio|texto|titulo|título|descricao|descrição|imagem|foto)\b/g, " ").replace(/\s+/g, " ").trim();
  if (!needle) return null;
  return all.find((row) => normalize(row.id) === needle || normalize(row.title) === needle)
    || all.find((row) => normalize(row.title).includes(needle) || needle.includes(normalize(row.title))) || null;
}
function absoluteImage(request: Request, image: string) { try { return new URL(image, request.url).toString(); } catch { return image; } }

export async function GET(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const settings = await readPortalSettings();
  return NextResponse.json({ prompt: typeof settings.ai_reviewer_prompt === "string" ? settings.ai_reviewer_prompt : DEFAULT_AI_REVIEWER_PROMPT }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const payload = await request.json().catch(() => ({})) as { prompt?: unknown };
  const prompt = typeof payload.prompt === "string" ? payload.prompt.trim().slice(0, 8000) : "";
  if (prompt.length < 80) return NextResponse.json({ error: "O prompt precisa ter pelo menos 80 caracteres." }, { status: 400 });
  await writePortalSettings({ ai_reviewer_prompt: prompt });
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const payload = await request.json().catch(() => ({})) as {
    action?: string; message?: string; listingId?: string; prompt?: string; confirmed?: boolean;
    history?: Array<{ role?: string; content?: string }>;
    draft?: { title?: string; description?: string; image?: string };
  };
  if (payload.action === "approve_all_pending") {
    if (!payload.confirmed) return NextResponse.json({ error: "Confirmação obrigatória." }, { status: 400 });
    const count = await adminApproveAllPendingListings();
    return NextResponse.json({ reply: `${count} anúncio(s) pendente(s) foram aprovados e publicados com sucesso.`, approvedCount: count });
  }
  if (payload.action === "publish" && payload.listingId) {
    const row = await findStoredListingById(payload.listingId, true); if (!row) return NextResponse.json({ error: "Anúncio não encontrado." }, { status: 404 });
    const images = (() => { try { return JSON.parse(row.imagesJson || "[]") as string[]; } catch { return []; } })();
    const draftImage = payload.draft?.image?.trim();
    const nextImages = draftImage ? [draftImage, ...images.filter((image) => image !== draftImage)] : images;
    const updated = await adminUpdateListing(row.id, { title: payload.draft?.title?.trim() || row.title, description: payload.draft?.description?.trim() || row.description, category: row.category, subcategory: row.subcategory, negotiationType: row.negotiationType, address: row.address, priceCents: row.priceCents, status: row.status, images: nextImages });
    return NextResponse.json({ reply: "Alterações aprovadas e publicadas no anúncio.", listing: updated ? publicListing(updated) : null });
  }

  const message = String(payload.message || "").trim();
  if (!message) return NextResponse.json({ error: "Digite uma mensagem para o revisor." }, { status: 400 });
  const normalized = normalize(message);
  const wantsPending = /pendente|pde/.test(normalized) && /listar|mostrar|quais|ver|anuncio/.test(normalized);
  const wantsApproveAll = /(aprovar|publicar|liberar).*(todos|todas|pendentes|pdes)/.test(normalized) || /(todos|todas).*(aprovar|publicar|liberar)/.test(normalized);
  if (wantsApproveAll) {
    const pending = (await listStoredListings(true)).filter((row) => row.status === "pending_review");
    return NextResponse.json({ reply: pending.length ? `Encontrei ${pending.length} anúncio(s) pendente(s). Posso aprovar e publicar todos agora, mas preciso da sua confirmação.` : "Não há anúncios pendentes para aprovar.", requiresConfirmation: pending.length > 0, confirmationAction: "approve_all_pending", count: pending.length, listings: pending.slice(0, 20).map(publicListing) });
  }
  if (wantsPending) {
    const pending = (await listStoredListings(true)).filter((row) => row.status === "pending_review");
    return NextResponse.json({ reply: pending.length ? `Localizei ${pending.length} anúncio(s) pendente(s). Selecione um para revisar ou peça para aprovar todos.` : "Não há anúncios pendentes no momento.", listings: pending.slice(0, 50).map(publicListing), count: pending.length });
  }

  const selected = await findListing(message, payload.listingId);
  if (!selected) return NextResponse.json({ reply: "Qual anúncio você deseja revisar? Envie o título exato, o código ou a URL do anúncio. Também posso listar os anúncios pendentes." });
  const listing = publicListing(selected); const imageUrl = absoluteImage(request, listing.image);
  const settings = await readPortalSettings();
  const agentPrompt = (payload.prompt || (typeof settings.ai_reviewer_prompt === "string" ? settings.ai_reviewer_prompt : DEFAULT_AI_REVIEWER_PROMPT)).slice(0, 8000);
  const wantsFullAnalysis = /analis|revis|melhor|corrig|reescrev|titulo|título|descri|texto|foto|imagem/.test(normalized);
  if (!wantsFullAnalysis && !payload.listingId) return NextResponse.json({ reply: `Encontrei o anúncio “${selected.title}”. O que deseja fazer: revisar texto, reescrever título e descrição, melhorar a imagem ou analisar tudo?`, selectedListing: listing });
  try {
    const history = (payload.history || []).flatMap((item) => item.role === "user" || item.role === "assistant" ? [{ role: item.role, content: String(item.content || "").slice(0, 1800) } as { role: "user" | "assistant"; content: string }] : []);
    const result = history.length > 1 ? await chatWithListingAgent({ title: selected.title, description: selected.description, category: selected.category, subcategory: selected.subcategory, imageUrl, agentInstructions: agentPrompt, messages: history }) : null;
    const review = result ? null : await reviewListingWithOpenAI({ title: selected.title, description: selected.description, category: selected.category, subcategory: selected.subcategory, imageUrl });
    let improvedImage = "";
    const wantsImage = /foto|imagem|desfoc|nitidez|qualidade/.test(normalized) || result?.imageAction === "improve";
    if (wantsImage && listing.image && listing.image !== "/favicon.svg") {
      const generated = await editListingImageWithOpenAI({ imageUrl, prompt: result?.imagePrompt || review?.imagePrompt || "Melhore tecnicamente esta foto para um anúncio profissional." });
      const { env } = await import("cloudflare:workers"); const key = `ai-review/${selected.id}/${crypto.randomUUID()}.webp`;
      await env.BUCKET.put(key, generated.bytes, { httpMetadata: { contentType: generated.contentType, cacheControl: "public, max-age=31536000, immutable" }, customMetadata: { listingId: selected.id, source: "openai-reviewer" } });
      improvedImage = `/api/media/${encodeURIComponent(key)}`;
    }
    return NextResponse.json({
      reply: result?.reply || `${review?.summary || "Análise concluída."} Revise o rascunho abaixo. Nada será alterado até você clicar em “Aprovar e publicar alterações”.`,
      selectedListing: listing,
      analysis: review,
      draft: { title: result?.suggestedTitle || review?.suggestedTitle || selected.title, description: result?.suggestedDescription || review?.suggestedDescription || selected.description, image: improvedImage },
    });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Falha ao consultar a inteligência artificial.";
    return NextResponse.json({ error: messageText === "OPENAI_NOT_CONFIGURED" ? "Configure a chave da API da OpenAI em Configurações." : messageText }, { status: 400 });
  }
}
