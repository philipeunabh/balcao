import { NextResponse } from "next/server";
import { getCustomerBySessionToken, onlyDigits, readCustomerCookie } from "../../../../../db/customer-auth";
import { deleteListingForUser, findListingForUser, prepareListingHighlight, setListingPaymentReference, setListingPaymentStatus, updateListingForUser } from "../../../../../db/listings";
import { createFeaturedCardPayment, createFeaturedPix } from "../../../../../db/pagbank";
import { getPagBankConfiguration } from "../../../../../db/pagbank";
import { createPaymentRecord } from "../../../../../db/payments";
import { getSavedCardToken, savePagBankCard } from "../../../../../db/saved-cards";
import { portalCategories } from "../../../../categories";
import { getFeaturedPlan } from "../../../../featured-plans";

type UnknownRecord = Record<string, unknown>;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const cents = (value: unknown) => value === "" || value == null ? null : Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const jsonObject = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, string | number | boolean> : {};
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

async function authenticated(request: Request) {
  return getCustomerBySessionToken(readCustomerCookie(request));
}

function publicEditRecord(listing: NonNullable<Awaited<ReturnType<typeof findListingForUser>>>) {
  return { ...listing, attributes: JSON.parse(listing.attributesJson || "{}"), features: JSON.parse(listing.featuresJson || "[]"), images: JSON.parse(listing.imagesJson || "[]") };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const customer = await authenticated(request); if (!customer) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const { id } = await params; const listing = await findListingForUser(id, customer.id);
  if (!listing) return NextResponse.json({ error: "Anúncio não encontrado." }, { status: 404 });
  return NextResponse.json({ listing: publicEditRecord(listing) }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const customer = await authenticated(request); if (!customer) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const { id } = await params; const current = await findListingForUser(id, customer.id);
  if (!current) return NextResponse.json({ error: "Anúncio não encontrado." }, { status: 404 });
  const payload = await request.json().catch(() => ({})) as UnknownRecord;
  const title = text(payload.title); const description = text(payload.description); const category = text(payload.category); const subcategory = text(payload.subcategory);
  const categoryRecord = portalCategories.find((item) => item.name === category);
  if (title.length < 8 || title.length > 120 || description.length < 30 || description.length > 5000) return NextResponse.json({ error: "Confira o título e a descrição." }, { status: 400 });
  if (!categoryRecord || !categoryRecord.subs.includes(subcategory)) return NextResponse.json({ error: "Categoria ou subcategoria inválida." }, { status: 400 });
  const previousImages = new Set<string>(JSON.parse(current.imagesJson || "[]"));
  const ownedPrefix = `/api/media/${encodeURIComponent(`listing-drafts/${customer.id}/`)}`;
  const images = Array.isArray(payload.images) ? payload.images.map(text).filter((url) => previousImages.has(url) || url.startsWith(ownedPrefix)).slice(0, 12) : [];
  if (!images.length) return NextResponse.json({ error: "Mantenha pelo menos uma foto no anúncio." }, { status: 400 });
  const attributes = jsonObject(payload.attributes);
  const videoUrl = safeVideoUrl(attributes.videoUrl);
  if (videoUrl === null) return NextResponse.json({ error: "Use um link HTTPS válido do YouTube, Vimeo ou de um arquivo MP4/WebM." }, { status: 400 });
  if (videoUrl) attributes.videoUrl = videoUrl; else delete attributes.videoUrl;
  const result = await updateListingForUser(id, customer.id, {
    title, description, category, subcategory, negotiationType: text(payload.negotiationType),
    priceCents: cents(payload.priceCents), monthlyRentCents: cents(payload.monthlyRentCents), iptuCents: cents(payload.iptuCents), condoCents: cents(payload.condoCents),
    negotiable: payload.negotiable === true, address: text(payload.address), latitude: payload.latitude == null ? null : Number(payload.latitude), longitude: payload.longitude == null ? null : Number(payload.longitude),
    displayName: text(payload.displayName), whatsapp: onlyDigits(text(payload.whatsapp)), attributes,
    features: Array.isArray(payload.features) ? payload.features.map(text).filter(Boolean).slice(0, 20) : [], images,
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ ok: true, changed: result.changed, status: result.changed ? "pending_review" : current.status, message: result.changed ? "Alterações salvas. O anúncio voltou para aprovação." : "Nenhuma alteração foi feita; o anúncio continua publicado." });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const customer = await authenticated(request); if (!customer) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const { id } = await params; const removed = await deleteListingForUser(id, customer.id);
  return removed ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Anúncio não encontrado." }, { status: 404 });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const customer = await authenticated(request); if (!customer) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const { id } = await params; const listing = await findListingForUser(id, customer.id);
  if (!listing) return NextResponse.json({ error: "Anúncio não encontrado." }, { status: 404 });
  const payload = await request.json().catch(() => ({})) as UnknownRecord;
  if (payload.action !== "highlight") return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  const superFeatured = payload.plan === "super";
  const monthly = getFeaturedPlan(listing.category, "monthly");
  const amountCents = superFeatured ? 9900 : monthly?.amountCents || 4900;
  const planCode = superFeatured ? "super" : "monthly";
  const planLabel = superFeatured ? "Super destaque" : `Destaque mensal · ${listing.category}`;
  const method = payload.method === "card" ? "CREDIT_CARD" : "PIX";
  const paymentConfiguration = await getPagBankConfiguration();
  if (method === "PIX" && !paymentConfiguration.pixEnabled) return NextResponse.json({ error: "O pagamento por Pix está desativado." }, { status: 400 });
  if (method === "CREDIT_CARD" && !paymentConfiguration.cardEnabled) return NextResponse.json({ error: "O pagamento por cartão está desativado." }, { status: 400 });
  await prepareListingHighlight(id, customer.id, planCode, amountCents, method);
  try {
    const origin = new URL(request.url).origin;
    const paymentInput = { listingId: id, planLabel, amountCents, origin, customer: { name: customer.name, email: customer.email, taxId: customer.taxId, whatsapp: customer.whatsapp } };
    if (method === "PIX") {
      const pix = await createFeaturedPix(paymentInput); await setListingPaymentReference(id, pix.orderId, pix.expiresAt);
      await createPaymentRecord({ userId: customer.id, listingId: id, providerReference: pix.orderId, method: "PIX", amountCents, status: "pending", providerStatus: "WAITING", planCode, planLabel, description: planLabel, expiresAt: pix.expiresAt });
      return NextResponse.json({ ok: true, method: "PIX", amountCents, qrCodeText: pix.qrCodeText, qrCodeImage: pix.qrCodeImage, expiresAt: pix.expiresAt });
    }
    const saved = text(payload.savedCardId) ? await getSavedCardToken(text(payload.savedCardId), customer.id) : null;
    const card = await createFeaturedCardPayment({ ...paymentInput, encryptedCard: text(payload.encryptedCard) || undefined, savedCardToken: saved?.token, securityCode: text(payload.securityCode), holderName: saved?.holderName || text(payload.cardHolderName), installments: Number(payload.installments || 1), saveCard: payload.saveCard === true });
    await setListingPaymentReference(id, card.orderId); await setListingPaymentStatus(id, card.paid ? "paid" : "pending");
    await createPaymentRecord({ userId: customer.id, listingId: id, providerReference: card.orderId, method: "CREDIT_CARD", amountCents, status: card.paid ? "paid" : "pending", providerStatus: card.status, planCode, planLabel, description: planLabel, cardBrand: card.cardBrand, cardLast4: card.cardLast4, paidAt: card.paidAt });
    if (payload.saveCard === true && card.cardToken && card.cardLast4) await savePagBankCard(customer.id, { token: card.cardToken, brand: card.cardBrand, last4: card.cardLast4, holderName: text(payload.cardHolderName) });
    return NextResponse.json({ ok: true, method: "CREDIT_CARD", amountCents, paid: card.paid, cardBrand: card.cardBrand, cardLast4: card.cardLast4 });
  } catch {
    await setListingPaymentStatus(id, "failed");
    return NextResponse.json({ error: "O PagBank não conseguiu iniciar o pagamento. Confira a integração e tente novamente." }, { status: 502 });
  }
}
