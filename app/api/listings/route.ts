import { NextResponse } from "next/server";
import { getAdminFromRequest } from "../../../db/admin-auth";
import { getCustomerBySessionToken, onlyDigits, readCustomerCookie } from "../../../db/customer-auth";
import { confirmFeaturedPayment, createListing, getAdminListingMetadata, setListingPaymentReference, setListingPaymentStatus } from "../../../db/listings";
import { createFeaturedCardPayment, createFeaturedPix } from "../../../db/pagbank";
import { createPaymentRecord } from "../../../db/payments";
import { readPortalSettings, readPrivateSetting } from "../../../db/settings";
import { sendListingCopy } from "../../../db/verification-delivery";
import { getHomeListings, getPublicListings } from "../../../db/public-listings";
import { classifyListingWithOpenAI } from "../../../db/openai";
import { portalCategories } from "../../categories";
import { getFeaturedPlan } from "../../featured-plans";
import { savePagBankCard } from "../../../db/saved-cards";
import { createListingInvoice } from "../../../db/invoices";

type UnknownRecord = Record<string, unknown>;
function text(value: unknown) { return typeof value === "string" ? value.trim() : value == null ? "" : String(value); }
export async function GET(request: Request) {
  const includePending = Boolean(await getAdminFromRequest(request));
  const url = new URL(request.url);
  const fresh = url.searchParams.get("fresh") === "1";
  const homeView = !includePending && url.searchParams.get("view") === "home";
  let listings = homeView
    ? await getHomeListings({ regularLimit: 180, storeLimit: 30, fresh })
    : await getPublicListings({ includePending, fresh });
  if (includePending) {
    const metadata = await getAdminListingMetadata(listings.map((item) => item.id));
    listings = listings.map((item) => ({ ...item, seller: { ...item.seller, ...metadata.get(item.id), email: metadata.get(item.id)?.sellerEmail }, analytics: metadata.get(item.id) }));
  }
  return NextResponse.json(
    { data: listings, total: listings.length, source: "database" },
    { headers: { "Cache-Control": includePending || fresh ? "no-store" : "public, max-age=60, s-maxage=300, stale-while-revalidate=86400" } },
  );
}
function optionalCents(value: unknown) { if (value === null || value === undefined || value === "") return null; const number = Number(value); return Number.isInteger(number) && number >= 0 ? number : null; }
function safeVideoUrl(value: unknown) {
  const candidate = text(value).slice(0, 500);
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.replace(/^www\./, "");
    const knownProvider = host === "youtu.be" || host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com") || host.endsWith("vimeo.com");
    const directVideo = /\.(mp4|webm)$/i.test(url.pathname);
    return knownProvider || directVideo ? url.toString() : null;
  } catch { return null; }
}
export async function POST(request: Request) {
  const customer = await getCustomerBySessionToken(readCustomerCookie(request)); if (!customer) return NextResponse.json({ error: "Entre na sua conta para publicar um anúncio." }, { status: 401 });
  const payload = await request.json().catch(() => ({})) as UnknownRecord; const title = text(payload.title); const description = text(payload.description); let category = text(payload.category); let subcategory = text(payload.subcategory); const negotiationType = text(payload.negotiationType); const address = text(payload.address); const displayName = text(payload.displayName); const whatsapp = onlyDigits(text(payload.whatsapp));
  const ownedImagePrefix = `/api/media/${encodeURIComponent(`listing-drafts/${customer.id}/`)}`; const images = Array.isArray(payload.images) ? payload.images.map(text).filter((item) => item.startsWith(ownedImagePrefix)).slice(0, 12) : [];
  const publicationType = payload.publicationType === "super_featured" ? "super_featured" : payload.publicationType === "featured" ? "featured" : "free";
  const isPromoted = publicationType === "featured" || publicationType === "super_featured";
  const featuredPlanCode = isPromoted && typeof payload.featuredPlan === "string" ? payload.featuredPlan : "";
  const paymentMethod = payload.paymentMethod === "card" ? "CREDIT_CARD" : "PIX";
  const encryptedCard = text(payload.encryptedCard);
  const cardHolderName = text(payload.cardHolderName);
  const cardInstallments = Number(payload.cardInstallments || 1);
  const settings = await readPortalSettings(); const configuredCategories = Array.isArray(settings.categories) ? settings.categories.flatMap((item) => { if (!item || typeof item !== "object") return []; const record = item as Record<string, unknown>; return typeof record.name === "string" && Array.isArray(record.subs) ? [{ name: record.name, subs: record.subs.filter((value): value is string => typeof value === "string") }] : []; }) : portalCategories; const knownCategory = configuredCategories.find((item) => item.name === category);
  if (title.length < 8 || title.length > 120) return NextResponse.json({ error: "Informe um título entre 8 e 120 caracteres." }, { status: 400 });
  if (description.length < 30 || description.length > 5_000) return NextResponse.json({ error: "A descrição deve ter entre 30 e 5.000 caracteres." }, { status: 400 });
  if (!knownCategory || !knownCategory.subs.includes(subcategory)) return NextResponse.json({ error: "Selecione uma categoria e subcategoria válidas." }, { status: 400 });
  if (await readPrivateSetting("openai_api_key")) {
    try {
      const reviewed = await classifyListingWithOpenAI({ title, description, currentCategory: category, currentSubcategory: subcategory, categories: configuredCategories });
      category = reviewed.category; subcategory = reviewed.subcategory;
    } catch { /* A falha da IA não impede que o usuário salve o anúncio. */ }
  }
  const baseFeaturedPlan = isPromoted ? getFeaturedPlan(category, featuredPlanCode) : undefined;
  const selectedFeaturedPlan = baseFeaturedPlan ? { ...baseFeaturedPlan, label: publicationType === "super_featured" ? `Super destaque ${baseFeaturedPlan.label}` : baseFeaturedPlan.label, amountCents: publicationType === "super_featured" ? baseFeaturedPlan.amountCents * 2 : baseFeaturedPlan.amountCents } : undefined;
  const featuredPlan = selectedFeaturedPlan?.code ?? null;
  const paymentSettings = { pix: settings.pagbank_pix_enabled !== false, card: settings.pagbank_card_enabled !== false };
  if (isPromoted && paymentMethod === "PIX" && !paymentSettings.pix) return NextResponse.json({ error: "O pagamento por Pix está desativado." }, { status: 400 });
  if (isPromoted && paymentMethod === "CREDIT_CARD" && !paymentSettings.card) return NextResponse.json({ error: "O pagamento por cartão está desativado." }, { status: 400 });
  if (isPromoted && paymentMethod === "CREDIT_CARD" && (encryptedCard.length < 80 || encryptedCard.length > 8_000 || cardHolderName.length < 3)) return NextResponse.json({ error: "Confira os dados do cartão e tente novamente." }, { status: 400 });
  if (isPromoted && paymentMethod === "CREDIT_CARD" && (!Number.isInteger(cardInstallments) || cardInstallments < 1 || cardInstallments > 3)) return NextResponse.json({ error: "Selecione uma opção válida de parcelamento." }, { status: 400 });
  if (!["Compra", "Venda", "Troca", "Aluguel", "Temporada", "Serviço", "Outra"].includes(negotiationType)) return NextResponse.json({ error: "Selecione o tipo de negociação." }, { status: 400 });
  if (!address || typeof payload.latitude !== "number" || typeof payload.longitude !== "number") return NextResponse.json({ error: "Selecione um endereço válido na busca." }, { status: 400 });
  if (displayName.length < 2 || whatsapp.length < 10 || whatsapp.length > 13) return NextResponse.json({ error: "Informe o nome de exibição e um WhatsApp válido." }, { status: 400 });
  if (images.length < 1 || images.length > 12) return NextResponse.json({ error: "Adicione de 1 a 12 fotos ao anúncio." }, { status: 400 });
  if (isPromoted && !featuredPlan) return NextResponse.json({ error: "Selecione um período de destaque." }, { status: 400 });
  const negotiable = payload.negotiable === true; const priceCents = optionalCents(payload.priceCents); const monthlyRentCents = optionalCents(payload.monthlyRentCents);
  if (!negotiable && negotiationType === "Aluguel" && monthlyRentCents == null) return NextResponse.json({ error: "Informe o valor mensal do aluguel." }, { status: 400 });
  if (!negotiable && negotiationType !== "Aluguel" && priceCents == null) return NextResponse.json({ error: "Informe o valor do anúncio." }, { status: 400 });
  const rawAttributes = payload.attributes && typeof payload.attributes === "object" && !Array.isArray(payload.attributes) ? payload.attributes as Record<string, unknown> : {};
  const videoUrl = safeVideoUrl(rawAttributes.videoUrl);
  if (videoUrl === null) return NextResponse.json({ error: "Use um link HTTPS válido do YouTube, Vimeo ou de um arquivo MP4/WebM." }, { status: 400 });
  const attributeEntries: Array<[string, string | number | boolean]> = [];
  for (const [key, value] of Object.entries(rawAttributes).slice(0, 30)) {
    if (key === "videoUrl") continue;
    if (!/^[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(key)) continue;
    if (typeof value === "boolean" || typeof value === "number") attributeEntries.push([key, value]);
    else if (typeof value === "string") attributeEntries.push([key, value.slice(0, 160)]);
  }
  if (videoUrl) attributeEntries.push(["videoUrl", videoUrl]);
  const attributes = Object.fromEntries(attributeEntries) as Record<string, string | number | boolean>;
  const features = Array.isArray(payload.features) ? payload.features.map(text).filter(Boolean).slice(0, 20) : [];
  const created = await createListing(customer, { title, description, negotiationType, category, subcategory, priceCents: negotiable ? null : priceCents, monthlyRentCents: negotiable ? null : monthlyRentCents, iptuCents: optionalCents(payload.iptuCents), condoCents: optionalCents(payload.condoCents), negotiable, address, latitude: payload.latitude, longitude: payload.longitude, displayName, whatsapp, attributes, features, images, publicationType, featuredPlan, paymentMethod: isPromoted ? paymentMethod : null, paymentAmountCents: selectedFeaturedPlan?.amountCents ?? null });
  if ("error" in created) return NextResponse.json({ error: created.error }, { status: 409 });
  let qrCodeText: string | undefined; let qrCodeImage: string | undefined; let paymentExpiresAt: string | undefined; let paymentUnavailable = false; let paid = false; let paymentStatus = isPromoted ? "pending" : null; let cardBrand: string | null = null; let cardLast4: string | null = null;
  if (isPromoted && selectedFeaturedPlan) {
    try {
      const origin = new URL(request.url).origin;
      const paymentInput = { listingId: created.id, planLabel: selectedFeaturedPlan.label.toLowerCase(), amountCents: selectedFeaturedPlan.amountCents, origin, customer: { name: customer.name, email: customer.email, taxId: customer.taxId, whatsapp: customer.whatsapp } };
      if (paymentMethod === "PIX") {
        const pix = await createFeaturedPix(paymentInput); await setListingPaymentReference(created.id, pix.orderId, pix.expiresAt);
        await createPaymentRecord({ userId: customer.id, listingId: created.id, providerReference: pix.orderId, method: "PIX", amountCents: selectedFeaturedPlan.amountCents, status: "pending", providerStatus: "WAITING", planCode: selectedFeaturedPlan.code, planLabel: selectedFeaturedPlan.label, description: `Destaque ${selectedFeaturedPlan.label}`, expiresAt: pix.expiresAt });
        qrCodeText = pix.qrCodeText; qrCodeImage = pix.qrCodeImage; paymentExpiresAt = pix.expiresAt;
      } else {
        const card = await createFeaturedCardPayment({ ...paymentInput, encryptedCard, holderName: cardHolderName, installments: cardInstallments, saveCard: payload.saveCard === true });
        await setListingPaymentReference(created.id, card.orderId);
        cardBrand = card.cardBrand; cardLast4 = card.cardLast4; paid = card.paid;
        paymentStatus = card.paid ? "paid" : ["DECLINED", "CANCELED", "DENIED"].includes(card.status) ? "declined" : "pending";
        await setListingPaymentStatus(created.id, paymentStatus);
        await createPaymentRecord({ userId: customer.id, listingId: created.id, providerReference: card.orderId, method: "CREDIT_CARD", amountCents: selectedFeaturedPlan.amountCents, status: paymentStatus as "pending" | "paid" | "declined", providerStatus: card.status, planCode: selectedFeaturedPlan.code, planLabel: selectedFeaturedPlan.label, description: `Destaque ${selectedFeaturedPlan.label}`, cardBrand: card.cardBrand, cardLast4: card.cardLast4, paidAt: card.paidAt });
        if (payload.saveCard === true && card.cardToken && card.cardLast4) await savePagBankCard(customer.id, { token: card.cardToken, brand: card.cardBrand, last4: card.cardLast4, holderName: cardHolderName });
        if (card.paid) await confirmFeaturedPayment(card.orderId);
      }
    } catch {
      paymentUnavailable = true;
      paymentStatus = "failed";
      await setListingPaymentStatus(created.id, "failed");
      await createPaymentRecord({ userId: customer.id, listingId: created.id, method: paymentMethod, amountCents: selectedFeaturedPlan.amountCents, status: "failed", providerStatus: "INTEGRATION_ERROR", planCode: selectedFeaturedPlan.code, planLabel: selectedFeaturedPlan.label, description: `Destaque ${selectedFeaturedPlan.label}` }).catch(() => undefined);
    }
  }
  await createListingInvoice({
    userId: customer.id,
    listingId: created.id,
    listingTitle: title,
    publicationType,
    planLabel: selectedFeaturedPlan?.label || null,
    amountCents: selectedFeaturedPlan?.amountCents || 0,
    paymentMethod: isPromoted ? paymentMethod : null,
    status: publicationType === "free" || paid ? "paid" : paymentUnavailable || paymentStatus === "failed" || paymentStatus === "declined" ? "failed" : "pending",
  }).catch(() => undefined);
  const valueCents = negotiable ? null : monthlyRentCents ?? priceCents; const priceLabel = valueCents == null ? "Valor a combinar" : `${(valueCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}${negotiationType === "Aluguel" ? "/mês" : ""}`;
  const emailSent = await sendListingCopy({ email: customer.email, name: customer.name, listingId: created.id, title, category, priceLabel, address, statusLabel: isPromoted ? "Aguardando pagamento do destaque" : "Pendente de revisão" }).then(() => true).catch(() => false);
  const message = isPromoted
    ? paymentUnavailable
      ? "Anúncio salvo na sua conta, mas o PagBank não conseguiu processar o pagamento. Confira a integração e tente novamente."
      : paid
        ? "Pagamento aprovado. O anúncio foi enviado para revisão."
        : paymentStatus === "declined"
          ? "Pagamento não aprovado. O anúncio foi salvo e a tentativa está disponível em Meus Pagamentos."
          : paymentMethod === "PIX"
            ? "Anúncio salvo com sucesso. Leia o QR Code abaixo para concluir o pagamento."
            : "Pagamento recebido e em processamento. A situação será atualizada automaticamente."
    : "Anúncio cadastrado com sucesso! Ele será revisado pela nossa equipe para publicação.";
  return NextResponse.json({ ok: true, listingId: created.id, status: paid ? "pending_review" : created.status, publicationType, qrCodeText, qrCodeImage, paymentExpiresAt, paymentUnavailable, paid, paymentStatus, cardBrand, cardLast4, paymentMethod: isPromoted ? paymentMethod : null, paymentAmountCents: selectedFeaturedPlan?.amountCents ?? null, featuredPlan, durationDays: selectedFeaturedPlan?.durationDays ?? 30, emailSent, message }, { status: paymentUnavailable ? 202 : 201 });
}
