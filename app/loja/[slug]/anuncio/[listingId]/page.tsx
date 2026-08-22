/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStoreListing, getVirtualStoreBySlug } from "../../../../../db/stores";
import { PortalFooter, PortalHeader } from "../../../../shared";
import { StoreLogo } from "../../../../storefront";

export const dynamic = "force-dynamic";

function whatsappNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits.startsWith("55") && (digits.length === 12 || digits.length === 13) ? digits : "";
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const local = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  if (local.length === 11) return local.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (local.length === 10) return local.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return value || "Não informado";
}

function safePurchaseUrl(value: string | null) {
  return value && /^https?:\/\//i.test(value) ? value : null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; listingId: string }> }): Promise<Metadata> {
  const { slug, listingId } = await params;
  const store = await getVirtualStoreBySlug(slug);
  const listing = store ? await getStoreListing(store.id, listingId) : null;
  return listing ? { title: `${listing.title} | ${store!.name}`, description: listing.description } : { title: "Anúncio não encontrado | Balcão" };
}

export default async function StoreListingPage({ params }: { params: Promise<{ slug: string; listingId: string }> }) {
  const { slug, listingId } = await params;
  const store = await getVirtualStoreBySlug(slug);
  if (!store) notFound();
  const listing = await getStoreListing(store.id, listingId);
  if (!listing) notFound();
  const images = JSON.parse(listing.imagesJson || "[]") as string[];
  const attributes = JSON.parse(listing.attributesJson || "{}") as Record<string, string | number | boolean>;
  const price = listing.priceCents == null ? "Valor a combinar" : (listing.priceCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const phone = whatsappNumber(store.whatsapp);
  const descriptionForMessage = listing.description.length > 800 ? `${listing.description.slice(0, 800)}…` : listing.description;
  const whatsappMessage = `Olá, vi seu produto publicado no site do Jornal Balcão. Gostaria de realizar a compra.\n\nTítulo: ${listing.title}\nPreço: ${price}\nDescrição: ${descriptionForMessage}\n\nÉ possível realizar a compra? Podemos conversar melhor?`;
  const whatsappUrl = phone ? `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(whatsappMessage)}` : null;
  const purchaseUrl = safePurchaseUrl(listing.externalUrl) || safePurchaseUrl(store.websiteUrl);
  const location = [store.address, store.city, store.state].filter(Boolean).join(" · ");
  return <main><PortalHeader /><section className="store-ad-shell"><nav><a href={`/loja/${store.slug}`}>{store.name}</a><span>›</span><span>{listing.subcategory}</span></nav><div className="store-ad-layout"><div><section className="store-ad-gallery"><img src={images[0] || listing.coverImage} alt={listing.title} /><div>{images.slice(1, 5).map((image) => <img key={image} src={image} alt="" loading="lazy" />)}</div></section><article className="store-ad-copy"><span>{listing.category} · {listing.subcategory}</span><h1>{listing.title}</h1><p>{listing.description}</p><h2>Detalhes</h2><dl>{Object.entries(attributes).filter(([, item]) => item !== true).map(([key, item]) => <div key={key}><dt>{key.replace(/_/g, " ")}</dt><dd>{String(item)}</dd></div>)}</dl></article></div><aside className="store-ad-sidebar"><div className="store-ad-price"><span>Preço</span><strong>{price}</strong><small>{listing.address}</small></div><div className="store-ad-seller"><StoreLogo store={store} /><div><span>Vendido por</span><a href={`/loja/${store.slug}`}>{store.name}</a><small>Loja verificada no Balcão</small></div></div><section className="store-contact-data" aria-label="Informações da loja"><h2>Informações da loja</h2><dl><div><dt>Localização</dt><dd>{location || "Não informada"}</dd></div><div><dt>Telefone e WhatsApp</dt><dd>{formatPhone(store.whatsapp)}</dd></div><div><dt>E-mail</dt><dd>{store.email || "Não informado"}</dd></div></dl></section><div className="store-purchase-actions">{purchaseUrl ? <a className="store-buy-button external" href={purchaseUrl} target="_blank" rel="noopener noreferrer sponsored">Comprar no site</a> : <span className="store-buy-button disabled" aria-disabled="true">Link de compra não configurado</span>}{whatsappUrl ? <a className="store-buy-button whatsapp" href={whatsappUrl} target="_blank" rel="noopener noreferrer">Comprar pelo WhatsApp</a> : <span className="store-buy-button disabled" aria-disabled="true">WhatsApp não configurado</span>}<a className="store-view-all" href={`/loja/${store.slug}`}>Ver todos os anúncios da loja</a></div>{store.isDemo ? <p>Este é um anúncio demonstrativo do recurso de lojas virtuais.</p> : null}</aside></div></section><PortalFooter /></main>;
}
