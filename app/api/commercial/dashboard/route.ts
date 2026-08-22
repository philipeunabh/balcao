import { NextResponse } from "next/server";
import { getCommercialFromRequest } from "../../../../db/admin-auth";
import { createListingByCommercial, sellListingHighlight } from "../../../../db/commercial";
import { createCustomerFromAdmin, isValidCnpj, isValidCpf, listCustomersForAdmin, onlyDigits } from "../../../../db/customer-auth";
import { getAdminListingMetadata, moderateListing } from "../../../../db/listings";
import { getPublicListings, invalidatePublicListingsCache } from "../../../../db/public-listings";
import { portalCategories } from "../../../categories";

function value(value: unknown) { return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim(); }
function cents(valueToParse: unknown) { const number = Number(valueToParse); return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0; }

async function authorized(request: Request) {
  const commercial = await getCommercialFromRequest(request);
  return commercial || null;
}

export async function GET(request: Request) {
  const commercial = await authorized(request);
  if (!commercial) return NextResponse.json({ error: "Acesso comercial necessário." }, { status: 401 });
  const [advertisers, listings] = await Promise.all([listCustomersForAdmin(), getPublicListings({ includePending: true, fresh: true })]);
  const metadata = await getAdminListingMetadata(listings.map((item) => item.id));
  return NextResponse.json({
    operator: { email: commercial.email },
    advertisers: advertisers.map((item) => ({
      id: item.id, name: item.name, email: item.email, whatsapp: item.whatsapp, accountType: item.accountType,
      taxId: item.taxId, planName: item.planName, adLimit: item.adLimit, activeAds: item.activeAds, createdAt: item.createdAt,
    })),
    listings: listings.map((item) => ({
      ...item,
      seller: { ...item.seller, email: metadata.get(item.id)?.sellerEmail, name: metadata.get(item.id)?.sellerName || item.seller.name },
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const commercial = await authorized(request);
  if (!commercial) return NextResponse.json({ error: "Acesso comercial necessário." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = value(body.action);
  try {
    if (action === "create-advertiser") {
      const accountType = body.accountType === "empresa" ? "empresa" : "particular";
      const taxId = onlyDigits(value(body.taxId));
      const whatsapp = onlyDigits(value(body.whatsapp));
      const email = value(body.email).toLowerCase();
      const name = value(body.name);
      const password = value(body.password);
      if (name.length < 2 || !email.includes("@")) return NextResponse.json({ error: "Informe nome e e-mail válidos." }, { status: 400 });
      if (accountType === "particular" ? !isValidCpf(taxId) : !isValidCnpj(taxId)) return NextResponse.json({ error: `${accountType === "particular" ? "CPF" : "CNPJ"} inválido.` }, { status: 400 });
      if (whatsapp.length < 10 || whatsapp.length > 11) return NextResponse.json({ error: "Informe um WhatsApp válido com DDD." }, { status: 400 });
      if (password.length < 8) return NextResponse.json({ error: "A senha temporária deve ter pelo menos 8 caracteres." }, { status: 400 });
      const created = await createCustomerFromAdmin({ accountType, taxId, email, name, whatsapp, password, isAdmin: false });
      return NextResponse.json({ ok: true, id: created.id, message: "Anunciante cadastrado e integrado ao portal." }, { status: 201 });
    }

    if (action === "create-listing") {
      const userId = Number(body.userId);
      const title = value(body.title);
      const description = value(body.description);
      const category = value(body.category);
      const subcategory = value(body.subcategory);
      const negotiationType = value(body.negotiationType) || "Venda";
      const address = value(body.address);
      const displayName = value(body.displayName);
      const whatsapp = onlyDigits(value(body.whatsapp));
      const publicationType = body.publicationType === "featured" ? "featured" : "free";
      const plan = body.featuredPlan === "semiannual" ? "semiannual" : body.featuredPlan === "quarterly" ? "quarterly" : "monthly";
      const selectedCategory = portalCategories.find((item) => item.name === category);
      const images = Array.isArray(body.images) ? body.images.map(value).filter((item) => item.startsWith("/api/media/listing-commercial%2F")).slice(0, 12) : [];
      if (!Number.isInteger(userId) || userId <= 0) return NextResponse.json({ error: "Selecione o anunciante." }, { status: 400 });
      if (title.length < 8 || title.length > 120) return NextResponse.json({ error: "O título deve ter entre 8 e 120 caracteres." }, { status: 400 });
      if (description.length < 30 || description.length > 5000) return NextResponse.json({ error: "A descrição deve ter entre 30 e 5.000 caracteres." }, { status: 400 });
      if (!selectedCategory || !selectedCategory.subs.includes(subcategory)) return NextResponse.json({ error: "Selecione uma categoria e subcategoria válidas." }, { status: 400 });
      if (!address) return NextResponse.json({ error: "Informe a localização do anúncio." }, { status: 400 });
      if (displayName.length < 2 || whatsapp.length < 10 || whatsapp.length > 11) return NextResponse.json({ error: "Informe o nome e o WhatsApp do anúncio." }, { status: 400 });
      if (!images.length) return NextResponse.json({ error: "Adicione pelo menos uma imagem." }, { status: 400 });
      const videoUrl = value(body.videoUrl);
      if (videoUrl && !/^https:\/\//i.test(videoUrl)) return NextResponse.json({ error: "O vídeo deve usar um endereço HTTPS." }, { status: 400 });
      const created = await createListingByCommercial(userId, {
        title, description, negotiationType, category, subcategory,
        priceCents: body.negotiable === true ? null : cents(body.priceCents), monthlyRentCents: null, iptuCents: null, condoCents: null,
        negotiable: body.negotiable === true, address, latitude: null, longitude: null, displayName, whatsapp,
        attributes: videoUrl ? { videoUrl } : {}, features: [], images,
        publicationType, featuredPlan: publicationType === "featured" ? plan : null,
        paymentMethod: null, paymentAmountCents: publicationType === "featured" ? cents(body.saleAmountCents) : null,
        highlightedAmountCents: cents(body.saleAmountCents), operatorEmail: commercial.email,
      });
      if ("error" in created) return NextResponse.json({ error: created.error }, { status: 409 });
      invalidatePublicListingsCache();
      return NextResponse.json({ ok: true, id: created.id, message: "Anúncio cadastrado e enviado para aprovação." }, { status: 201 });
    }

    if (action === "moderate") {
      const listingId = value(body.listingId);
      const decision = body.decision === "reject" ? "reject" : "approve";
      const result = await moderateListing(listingId, decision);
      if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 });
      invalidatePublicListingsCache();
      return NextResponse.json({ ok: true, message: decision === "approve" ? "Anúncio aprovado e publicado." : "Anúncio rejeitado." });
    }

    if (action === "sell-highlight") {
      const listingId = value(body.listingId);
      const planCode = body.planCode === "semiannual" ? "semiannual" : body.planCode === "quarterly" ? "quarterly" : "monthly";
      const amountCents = cents(body.amountCents);
      if (!listingId || amountCents <= 0) return NextResponse.json({ error: "Selecione o anúncio e informe o valor da venda." }, { status: 400 });
      const result = await sellListingHighlight({ listingId, planCode, amountCents, operatorEmail: commercial.email });
      if ("error" in result) return NextResponse.json({ error: result.error }, { status: 404 });
      invalidatePublicListingsCache();
      return NextResponse.json({ ok: true, message: "Venda do destaque registrada no anúncio." });
    }

    return NextResponse.json({ error: "Ação comercial inválida." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error && /UNIQUE|constraint/i.test(error.message)
      ? "CPF/CNPJ ou e-mail já cadastrado."
      : error instanceof Error ? error.message : "Não foi possível concluir a operação.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export const dynamic = "force-dynamic";
