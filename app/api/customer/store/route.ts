import { NextResponse } from "next/server";
import { getCustomerBySessionToken, onlyDigits, readCustomerCookie } from "../../../../db/customer-auth";
import { getVirtualStoreByUser, listStoreListings, requestStoreRenewal, saveVirtualStore, storePlanIsCurrent, type StoreIntegrationType, type StorePlanCode, type StoreSocialLinks, type StoreType, virtualStorePlans } from "../../../../db/stores";

const storeTypes = new Set<StoreType>(["real_estate", "vehicle", "general"]);
const integrationTypes = new Set<StoreIntegrationType>(["manual", "xml", "json", "api", "wordpress", "website", "partner"]);
const colorPattern = /^#[0-9a-f]{6}$/i;

function cleanSlug(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
}

export async function GET(request: Request) {
  const customer = await getCustomerBySessionToken(readCustomerCookie(request));
  if (!customer) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const store = await getVirtualStoreByUser(customer.id);
  return NextResponse.json({ store, listings: store ? await listStoreListings(store.id) : [], planCurrent: store ? storePlanIsCurrent(store) : false, plans: Object.values(virtualStorePlans) });
}

export async function PUT(request: Request) {
  const customer = await getCustomerBySessionToken(readCustomerCookie(request));
  if (!customer) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  if (!(await getVirtualStoreByUser(customer.id))) return NextResponse.json({ error: "O acesso lojista precisa ser habilitado pelo administrador." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const name = String(body.name || "").trim();
  const slug = cleanSlug(String(body.slug || name));
  const type = String(body.type || "general") as StoreType;
  const integrationType = String(body.integrationType || "manual") as StoreIntegrationType;
  const description = String(body.description || "").trim().slice(0, 1500);
  const logoUrl = String(body.logoUrl || "").trim() || null;
  const bannerUrl = String(body.bannerUrl || "").trim() || null;
  const primaryColor = colorPattern.test(String(body.primaryColor || "")) ? String(body.primaryColor) : "#d71920";
  const secondaryColor = colorPattern.test(String(body.secondaryColor || "")) ? String(body.secondaryColor) : "#17191e";
  const feedUrl = String(body.feedUrl || "").trim() || null;
  const partnerName = String(body.partnerName || "").trim().slice(0, 120) || null;
  const websiteUrl = String(body.websiteUrl || "").trim() || null;
  const email = String(body.email || customer.email).trim().toLowerCase();
  const phone = onlyDigits(String(body.phone || "")).slice(0, 13);
  const whatsapp = onlyDigits(String(body.whatsapp || customer.whatsapp)).slice(0, 13);
  const socialLinks = Object.fromEntries(Object.entries(body.socialLinks && typeof body.socialLinks === "object" ? body.socialLinks as Record<string, unknown> : {}).flatMap(([key, raw]) => {
    if (!["instagram", "facebook", "youtube", "tiktok", "linkedin"].includes(key)) return [];
    const url = String(raw || "").trim(); return !url || /^https:\/\//i.test(url) ? [[key, url]] : [];
  })) as StoreSocialLinks;
  const address = String(body.address || "").trim().slice(0, 240);
  const city = String(body.city || "").trim().slice(0, 100);
  const state = String(body.state || "").trim().toUpperCase().slice(0, 2);
  if (name.length < 3) return NextResponse.json({ error: "Informe o nome da loja." }, { status: 400 });
  if (slug.length < 3) return NextResponse.json({ error: "Informe uma URL profissional válida." }, { status: 400 });
  if (!storeTypes.has(type)) return NextResponse.json({ error: "Tipo de loja inválido." }, { status: 400 });
  if (!integrationTypes.has(integrationType)) return NextResponse.json({ error: "Tipo de integração inválido." }, { status: 400 });
  if (logoUrl && !logoUrl.startsWith("/api/media/") && !/^https:\/\//i.test(logoUrl)) {
    return NextResponse.json({ error: "A logo informada é inválida." }, { status: 400 });
  }
  if (bannerUrl && !bannerUrl.startsWith("/api/media/") && !/^https:\/\//i.test(bannerUrl)) return NextResponse.json({ error: "O banner informado é inválido." }, { status: 400 });
  if (feedUrl && !/^https?:\/\//i.test(feedUrl)) return NextResponse.json({ error: "Informe uma URL HTTP ou HTTPS para o feed." }, { status: 400 });
  if (websiteUrl && !/^https?:\/\//i.test(websiteUrl)) return NextResponse.json({ error: "Informe uma URL HTTP ou HTTPS para o site de compra." }, { status: 400 });
  if (whatsapp && whatsapp.length < 10) return NextResponse.json({ error: "Informe um WhatsApp profissional válido." }, { status: 400 });
  try {
    const store = await saveVirtualStore(customer.id, { slug, name, type, logoUrl, bannerUrl, primaryColor, secondaryColor, description, integrationType, feedUrl, partnerName, websiteUrl, email, phone, whatsapp, socialLinks, address, city, state });
    return NextResponse.json({ store, publicUrl: `/loja/${slug}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/unique|constraint/i.test(message)) return NextResponse.json({ error: "Esta URL profissional já está em uso." }, { status: 409 });
    return NextResponse.json({ error: "Não foi possível salvar a loja." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const customer = await getCustomerBySessionToken(readCustomerCookie(request));
  if (!customer) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const store = await getVirtualStoreByUser(customer.id);
  if (!store) return NextResponse.json({ error: "Sua loja ainda não foi habilitada." }, { status: 400 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const requestedPlanCode = String(body.planCode || store.planCode) as StorePlanCode;
  if (!(requestedPlanCode in virtualStorePlans)) return NextResponse.json({ error: "Plano inválido." }, { status: 400 });
  const requestId = await requestStoreRenewal(store, requestedPlanCode);
  return NextResponse.json({ ok: true, requestId, message: "Pedido de renovação enviado ao administrador." });
}

export const dynamic = "force-dynamic";
