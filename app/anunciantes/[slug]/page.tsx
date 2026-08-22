/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation";
import { getPublicAdvertiserBySlug } from "../../../db/customer-auth";
import { listUserListings } from "../../../db/listings";
import type { StoredListing } from "../../../db/listings";
import { PortalFooter, PortalHeader } from "../../shared";
import AdvertiserChatButton from "./advertiser-chat-button";

export const dynamic = "force-dynamic";

function whatsappUrl(phone: string, name: string) {
  const digits = phone.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  return `https://api.whatsapp.com/send?phone=55${digits}&text=${encodeURIComponent(`Olá, encontrei seu perfil de anunciante no Portal Balcão, ${name}.`)}`;
}

export default async function AdvertiserPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const advertiser = await getPublicAdvertiserBySlug(slug) as { id: number; name: string; whatsapp: string; profileImageUrl: string | null; createdAt: string } | null; if (!advertiser) notFound();
  const listings: StoredListing[] = (await listUserListings(advertiser.id) as StoredListing[]).filter((item: StoredListing) => item.status === "active");
  const initials = advertiser.name.split(/\s+/).slice(0,2).map((part: string) => part[0]).join("").toUpperCase();
  return <main><PortalHeader /><section className="advertiser-profile-shell"><header className="advertiser-profile-card">{advertiser.profileImageUrl ? <img src={advertiser.profileImageUrl} alt={`Foto de ${advertiser.name}`} /> : <span>{initials}</span>}<div><small>Anunciante no Balcão desde {new Date(advertiser.createdAt).toLocaleDateString("pt-BR")}</small><h1>{advertiser.name}</h1><p>{listings.length} anúncio(s) publicado(s)</p></div><nav><a href={`tel:${advertiser.whatsapp.replace(/\D/g, "")}`}>Ligar</a><a className="whatsapp" href={whatsappUrl(advertiser.whatsapp, advertiser.name)} target="_blank" rel="noopener noreferrer">WhatsApp</a><AdvertiserChatButton listingId={listings[0]?.id || ""} /></nav></header><div className="advertiser-listing-head"><div><span>Publicações</span><h2>Anúncios de {advertiser.name}</h2></div><small>Mais recentes primeiro</small></div>{listings.length ? <div className="advertiser-listing-grid">{listings.map((item) => { const images = JSON.parse(item.imagesJson || "[]") as string[]; const value = item.negotiable || item.priceCents == null ? "Valor a combinar" : (item.priceCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); return <article key={item.id}><a href={`/anuncio/${encodeURIComponent(item.id)}`}><img src={item.coverImage || images[0] || "/favicon.svg"} alt="" /><span>{item.category}</span><h3>{item.title}</h3><p>{item.address}</p><strong>{value}</strong></a></article>; })}</div> : <div className="empty-state"><h2>Nenhum anúncio publicado</h2><p>Este anunciante ainda não possui anúncios ativos.</p></div>}</section><PortalFooter /></main>;
}
