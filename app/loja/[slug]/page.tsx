import type { Metadata } from "next";
/* eslint-disable @next/next/no-img-element */
import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { getVirtualStoreBySlug, listStoreListings } from "../../../db/stores";
import { PortalFooter, PortalHeader } from "../../shared";
import { StoreListingCard, StoreLogo } from "../../storefront";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const store = await getVirtualStoreBySlug(slug);
  return store ? { title: `${store.name} | Loja Balcão`, description: store.description, alternates: { canonical: `/loja/${encodeURIComponent(slug)}` }, openGraph: { type: "website", title: `${store.name} | Loja Balcão`, description: store.description, url: `/loja/${encodeURIComponent(slug)}`, images: store.logoUrl ? [store.logoUrl] : ["/logo-balcao.jpg"] } } : { title: "Loja não encontrada | Balcão", robots: { index: false, follow: true } };
}

export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getVirtualStoreBySlug(slug);
  if (!store) notFound();
  const listings = await listStoreListings(store.id);
  const typeLabel = store.type === "real_estate" ? "Imobiliária" : store.type === "vehicle" ? "Loja de veículos" : "Loja virtual";
  const style={"--store-primary":store.primaryColor,"--store-secondary":store.secondaryColor} as CSSProperties;
  return <main className="custom-storefront" style={style}><PortalHeader />{store.bannerUrl?<img className="store-custom-banner" src={store.bannerUrl} alt={`Banner da ${store.name}`}/>:null}<section className="store-profile-hero"><div className="store-profile-shell"><StoreLogo store={store} large /><div><span>{typeLabel} · Loja verificada</span><h1>{store.name}</h1><p>{store.description}</p><small>{store.city}{store.city && store.state ? " - " : ""}{store.state} · URL profissional: /loja/{store.slug}</small></div><aside><strong>{listings.length}</strong><span>anúncios ativos</span><a href="#estoque">Ver catálogo</a></aside></div></section><section className="store-profile-nav"><div><a href="#estoque">Anúncios</a><a href="#sobre">Sobre a loja</a><a href="/lojas">Outras lojas</a></div></section><section id="estoque" className="store-inventory-shell"><header><div><span>Estoque atualizado</span><h2>Anúncios da loja</h2></div><strong>{listings.length} resultado(s)</strong></header><div className="store-listing-grid">{listings.map((listing) => <StoreListingCard key={listing.id} store={store} listing={listing} />)}</div></section><section id="sobre" className="store-about-shell"><div><span>Sobre</span><h2>{store.name}</h2><p>{store.description}</p><dl><div><dt>Especialidade</dt><dd>{typeLabel}</dd></div><div><dt>Localização</dt><dd>{store.address||store.city} {store.state}</dd></div><div><dt>Integração</dt><dd>{store.integrationType === "partner" ? "Site parceiro" : store.integrationType.toUpperCase()}</dd></div><div><dt>Catálogo</dt><dd>{listings.length} anúncios ativos</dd></div></dl><nav className="store-social-links">{Object.entries(store.socialLinks).filter(([,url])=>url).map(([network,url])=><a key={network} href={url} target="_blank" rel="noreferrer">{network}</a>)}</nav></div><aside><StoreLogo store={store} large /><strong>{store.email}</strong><span>{store.phone||store.whatsapp||"Contato disponível pela plataforma"}</span>{store.websiteUrl?<a className="primary-button" href={store.websiteUrl} target="_blank" rel="noreferrer">Comprar no site</a>:null}</aside></section><PortalFooter /></main>;
}
