/* eslint-disable @next/next/no-img-element */
import type { StoreListingRecord, StoreType, VirtualStoreRecord } from "../db/stores";
import { PortalFooter, PortalHeader } from "./shared";

export function StoreLogo({ store, large = false }: { store: VirtualStoreRecord; large?: boolean }) {
  const initials = store.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return store.logoUrl
    ? <img className={`store-logo ${large ? "large" : ""}`} src={store.logoUrl} alt={`Logo da ${store.name}`} />
    : <span className={`store-logo store-logo-mark ${large ? "large" : ""}`} aria-label={`Logo da ${store.name}`}>{initials}</span>;
}

export function StoreCard({ store, listingCount }: { store: VirtualStoreRecord; listingCount?: number }) {
  const typeLabel = store.type === "real_estate" ? "Imobiliária" : store.type === "vehicle" ? "Loja de veículos" : "Loja virtual";
  return <article className="store-directory-card">
    <div className="store-card-top"><StoreLogo store={store} /><div><span>{typeLabel}</span><h2>{store.name}</h2><small>{store.city}{store.city && store.state ? " · " : ""}{store.state}</small></div></div>
    <p>{store.description}</p>
    <div className="store-card-footer"><span>{listingCount == null ? "Estoque atualizado" : `${listingCount} anúncios`}</span><a href={`/loja/${store.slug}`}>Visitar loja</a></div>
  </article>;
}

export function StoreListingCard({ store, listing }: { store: VirtualStoreRecord; listing: StoreListingRecord }) {
  return <article className="store-listing-card">
    <a href={`/loja/${store.slug}/anuncio/${listing.id}`} className="store-listing-image"><img src={listing.coverImage} alt="" loading="lazy" decoding="async" />{listing.featured ? <span>Destaque</span> : null}</a>
    <div><small>{listing.subcategory}</small><h3><a href={`/loja/${store.slug}/anuncio/${listing.id}`}>{listing.title}</a></h3><p>{listing.address}</p><strong>{listing.priceCents == null ? "Valor a combinar" : (listing.priceCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}</strong></div>
  </article>;
}

export function StoreDirectory({ title, eyebrow, description, stores, counts, type }: { title: string; eyebrow: string; description: string; stores: VirtualStoreRecord[]; counts: Record<string, number>; type?: StoreType }) {
  return <main><PortalHeader /><section className="store-directory-hero"><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p><div className="store-directory-actions"><a className="primary-button" href="/lojas-virtuais">Criar minha loja</a><a className="secondary-button" href="/lojas">Ver todas as lojas</a></div></div></section><section className="store-directory-shell"><div className="store-directory-heading"><div><span>Lojas verificadas</span><h2>{stores.length} loja(s) em destaque</h2></div>{type ? <a href="/lojas">Limpar filtro</a> : null}</div><div className="store-directory-grid">{stores.map((store) => <StoreCard key={store.id} store={store} listingCount={counts[store.id]} />)}</div></section><PortalFooter /></main>;
}
