"use client";
/* eslint-disable @next/next/no-html-link-for-pages */

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AdSenseUnit,
  CompactCard,
  LatestNews,
  MiartLarBanner,
  OptimizedImage,
  PortalFooter,
  PortalHeader,
  type PortalListing,
  useImportedListings,
} from "../../shared";
import { itatiaiaVideoListings } from "../../itatiaia-videos";
import { SITE_URL } from "../../../lib/site-url";

const attributeLabels: Record<string, string> = { propertyType: "Tipo do imóvel", bedrooms: "Quartos", bathrooms: "Banheiros", parkingSpaces: "Vagas", area: "Área útil (m²)", condition: "Condição", vehicleType: "Tipo", brand: "Marca", model: "Modelo", year: "Ano de fabricação", modelYear: "Ano modelo", doors: "Portas", color: "Cor", transmission: "Câmbio", fuel: "Combustível", mileage: "Quilometragem", durationLabel: "Duração" };

type VideoPlayer = { kind: "embed" | "file"; src: string };
function resolveVideoPlayer(value?: string): VideoPlayer | null {
  if (!value) return null;
  if (/^\/(?!\/).+\.(mp4|webm)(?:\?.*)?$/i.test(value)) return { kind: "file", src: value };
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be" || host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      const id = host === "youtu.be" ? url.pathname.split("/").filter(Boolean)[0] : url.searchParams.get("v") || url.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/)?.[1];
      return id && /^[\w-]{6,20}$/.test(id) ? { kind: "embed", src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0` } : null;
    }
    if (host.endsWith("vimeo.com")) {
      const id = url.pathname.match(/\/(\d+)/)?.[1];
      return id ? { kind: "embed", src: `https://player.vimeo.com/video/${id}` } : null;
    }
    return /\.(mp4|webm)$/i.test(url.pathname) ? { kind: "file", src: url.toString() } : null;
  } catch { return null; }
}

function ShareButtons({ slug, title }: { slug: string; title: string }) {
  const fallbackUrl = `${SITE_URL}/anuncio/${encodeURIComponent(slug)}`;
  const shareUrl = fallbackUrl;
  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedMessage = encodeURIComponent(`${title} - ${shareUrl}`);
  const emailSubject = encodeURIComponent(`Anúncio no Portal Balcão: ${title}`);
  const emailBody = encodeURIComponent(`Veja este anúncio no Portal Balcão:\n\n${title}\n${shareUrl}`);

  return (
    <div className="share-block" id="compartilhar" aria-label="Compartilhar anúncio">
      <strong>Compartilhar</strong>
      <div className="share-actions">
        <a className="share-whatsapp" href={`https://api.whatsapp.com/send?text=${encodedMessage}`} target="_blank" rel="noopener noreferrer" aria-label="Compartilhar no WhatsApp">
          <span aria-hidden="true">W</span> WhatsApp
        </a>
        <a className="share-facebook" href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`} target="_blank" rel="noopener noreferrer" aria-label="Compartilhar no Facebook">
          <span aria-hidden="true">f</span> Facebook
        </a>
        <a className="share-email" href={`mailto:?subject=${emailSubject}&body=${emailBody}`} aria-label="Compartilhar por e-mail">
          <span aria-hidden="true">✉</span> E-mail
        </a>
      </div>
    </div>
  );
}

function DetailLoading() {
  return (
    <>
      <PortalHeader />
      <div className="detail-shell detail-loading-shell" aria-busy="true" aria-label="Carregando anúncio">
        <MiartLarBanner className="detail-miart-banner" />
        <div className="detail-loading-title" />
        <div className="detail-loading-grid">
          <div className="detail-loading-photo" />
          <div className="detail-loading-side" />
        </div>
      </div>
      <PortalFooter />
    </>
  );
}

export default function ListingDetailsClient({ slug, videoItem }: { slug: string; videoItem?: PortalListing }) {
  const { items, loading } = useImportedListings();
  const item = items.find((entry) => entry.id === slug) || videoItem;
  const [activePhoto, setActivePhoto] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [contactPhone, setContactPhone] = useState("Ver telefone");
  const [phoneRevealed, setPhoneRevealed] = useState(false);
  const [whatsappUsed, setWhatsappUsed] = useState(false);
  const [isListingOwner, setIsListingOwner] = useState(false);
  const [contactBusy, setContactBusy] = useState<"phone" | "whatsapp" | "chat" | null>(null);
  const [contactStatus, setContactStatus] = useState("");
  const [proposalBusy, setProposalBusy] = useState(false);
  const [proposalStatus, setProposalStatus] = useState("");
  const [proposalSent, setProposalSent] = useState(false);
  const [favorite, setFavorite] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const favorites = JSON.parse(localStorage.getItem("balcao-favorites") || "[]") as string[];
      return favorites.includes(slug);
    } catch {
      return false;
    }
  });

  const related = useMemo(() => {
    if (!item) return [];
    const seed = [...slug].reduce((total, character) => total + character.charCodeAt(0), 0);
    const pool = item.status === "video-static" ? [...itatiaiaVideoListings, ...items] : items;
    return pool
      .filter((entry) => entry.id !== item.id)
      .map((entry, index) => ({
        entry,
        relevance: (entry.category === item.category ? 4 : 0) + (entry.subcategory && entry.subcategory === item.subcategory ? 3 : 0),
        sort: ((index + 1) * 9301 + seed * 49297) % 233280,
      }))
      .sort((a, b) => b.relevance - a.relevance || a.sort - b.sort)
      .map(({ entry }) => entry)
      .slice(0, 10);
  }, [item, items, slug]);

  const photos = useMemo(() => {
    if (!item) return [];
    const source = item.images?.length ? [item.image, ...item.images] : [item.image];
    return [...new Set(source.filter(Boolean))];
  }, [item]);

  useEffect(() => {
    if (!item || item.status === "demo" || item.status === "video-static") return;
    fetch(`/api/listings/${encodeURIComponent(item.id)}/contact`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "view" }) }).catch(() => undefined);
    try {
      const current = JSON.parse(localStorage.getItem("balcao-view-history") || "[]") as string[];
      localStorage.setItem("balcao-view-history", JSON.stringify([item.id, ...current.filter((id) => id !== item.id)].slice(0, 30)));
    } catch {
      localStorage.setItem("balcao-view-history", JSON.stringify([item.id]));
    }
  }, [item]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightboxOpen(false);
      if (event.key === "ArrowLeft") setActivePhoto((current) => (current - 1 + photos.length) % photos.length);
      if (event.key === "ArrowRight") setActivePhoto((current) => (current + 1) % photos.length);
    };
    document.body.classList.add("detail-lightbox-open");
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("detail-lightbox-open");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [lightboxOpen, photos.length]);

  useEffect(() => {
    if (!item || item.status === "demo" || item.status === "video-static") return;
    fetch(`/api/listings/${encodeURIComponent(item.id)}/contact`, { cache: "no-store" })
      .then(async (response) => ({ response, payload: await response.json().catch(() => ({})) as { maskedPhone?: string; whatsappUsed?: boolean; isOwner?: boolean } }))
      .then(({ response, payload }) => {
        if (!response.ok) return;
        if (payload.maskedPhone) setContactPhone(payload.maskedPhone);
        setWhatsappUsed(payload.whatsappUsed === true);
        setIsListingOwner(payload.isOwner === true);
      })
      .catch(() => undefined);
  }, [item]);

  if (!item && loading) return <DetailLoading />;
  if (!item) {
    return <main><PortalHeader /><div className="detail-shell"><MiartLarBanner className="detail-miart-banner" /><div className="detail-data-status" role="status">Anúncio não encontrado.</div></div><PortalFooter /></main>;
  }

  const photoIndex = Math.min(activePhoto, Math.max(photos.length - 1, 0));
  const shownPhoto = photos[photoIndex] || item.image;
  const videoPlayer = resolveVideoPlayer(item.videoUrl);
  const staticVideo = item.status === "video-static";
  const galleryThumbnails = photos.slice(0, 7);
  const details = item.property
    ? [
        ["Negociação", item.property.transaction],
        ["Tipo do imóvel", item.property.type],
        ["Cidade", item.property.city],
        ["Estado", item.property.state],
        ["Bairro", item.property.neighborhood],
        ["Categoria", item.subcategory || item.category],
      ]
    : item.vehicle
      ? [
          ["Marca", item.vehicle.brand],
          ["Modelo", item.vehicle.model],
          ["Ano", item.vehicle.year ? String(item.vehicle.year) : undefined],
          ["Câmbio", item.vehicle.transmission],
          ["Combustível", item.vehicle.fuel],
          ["Categoria", item.subcategory || item.category],
        ]
      : [
          ["Categoria", item.category],
          ["Subcategoria", item.subcategory],
          ["Localização", item.location],
        ];
  const attributeDetails = Object.entries(item.attributes || {}).flatMap(([key, value]) => attributeLabels[key] && value !== "" ? [[attributeLabels[key], String(value)]] : []);
  const allDetails = [...details, ...attributeDetails];
  const tags = [...new Set([
    item.category,
    item.subcategory,
    item.property?.transaction,
    item.property?.type,
    item.property?.city,
    item.property?.state,
  ].filter((value): value is string => Boolean(value)))];
  const superFeatured = /super|ultra/i.test(`${item.publicationType || ""} ${item.featuredPlan || ""}`);
  const sellerSlug = (item.sellerName || "anunciante").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const previousPhoto = () => setActivePhoto((current) => (current - 1 + photos.length) % photos.length);
  const nextPhoto = () => setActivePhoto((current) => (current + 1) % photos.length);
  const toggleFavorite = () => {
    const next = !favorite;
    setFavorite(next);
    try {
      const current = JSON.parse(localStorage.getItem("balcao-favorites") || "[]") as string[];
      localStorage.setItem("balcao-favorites", JSON.stringify(next ? [item.id, ...current.filter((id) => id !== item.id)] : current.filter((id) => id !== item.id)));
    } catch {
      localStorage.setItem("balcao-favorites", JSON.stringify(next ? [item.id] : []));
    }
  };
  const revealPhone = async () => {
    if (phoneRevealed || contactBusy) return;
    setContactBusy("phone"); setContactStatus("");
    const response = await fetch(`/api/listings/${encodeURIComponent(item.id)}/contact`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "phone" }) }).catch(() => null);
    const payload = response ? await response.json().catch(() => ({})) as { phone?: string; error?: string } : {};
    if (response?.ok && payload.phone) { setContactPhone(payload.phone); setPhoneRevealed(true); }
    else setContactStatus(payload.error || "Não foi possível exibir o telefone.");
    setContactBusy(null);
  };
  const openWhatsApp = async () => {
    if (whatsappUsed || contactBusy) return;
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    setContactBusy("whatsapp"); setContactStatus("");
    const response = await fetch(`/api/listings/${encodeURIComponent(item.id)}/contact`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "whatsapp" }) }).catch(() => null);
    const payload = response ? await response.json().catch(() => ({})) as { url?: string; error?: string; alreadyUsed?: boolean } : {};
    if (response?.ok && payload.url) {
      setWhatsappUsed(true);
      if (popup) popup.location.href = payload.url; else window.location.assign(payload.url);
    } else {
      popup?.close();
      if (payload.alreadyUsed) setWhatsappUsed(true);
      setContactStatus(payload.error || "Não foi possível abrir o WhatsApp.");
    }
    setContactBusy(null);
  };
  const startChat = async () => {
    if (contactBusy) return;
    setContactBusy("chat"); setContactStatus("");
    const response = await fetch("/api/chat/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId: item.id }) }).catch(() => null);
    const payload = response ? await response.json().catch(() => ({})) as { conversationId?: string; error?: string } : {};
    if (response?.status === 401) {
      window.location.assign(`/entrar?returnTo=${encodeURIComponent(`/anuncio/${item.id}`)}`);
      return;
    }
    if (response?.ok && payload.conversationId) {
      fetch(`/api/listings/${encodeURIComponent(item.id)}/contact`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "chat" }) }).catch(() => undefined);
      window.location.assign(`/minha-conta/mensagens?conversation=${encodeURIComponent(payload.conversationId)}`);
      return;
    }
    setContactStatus(payload.error || "Não foi possível iniciar o chat."); setContactBusy(null);
  };
  const submitProposal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (proposalBusy || proposalSent) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    setProposalBusy(true); setProposalStatus("");
    const response = await fetch(`/api/listings/${encodeURIComponent(item.id)}/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "proposal", name: values.get("name"), email: values.get("email"), phone: values.get("phone"), message: values.get("message") }),
    }).catch(() => null);
    const payload = response ? await response.json().catch(() => ({})) as { error?: string; emailSent?: boolean } : {};
    if (response?.ok) {
      setProposalSent(true);
      setProposalStatus(payload.emailSent === false ? "Proposta registrada. O envio por e-mail está temporariamente indisponível." : "Proposta enviada ao anunciante com sucesso.");
      form.reset();
    } else setProposalStatus(payload.error || "Não foi possível enviar a proposta agora.");
    setProposalBusy(false);
  };

  return (
    <main>
      <PortalHeader />
      <div className="detail-shell">
        <MiartLarBanner className="detail-miart-banner" />
        {videoPlayer ? <section className="detail-video-hero" aria-label={`Vídeo do anúncio ${item.title}`}>
          <div className="detail-video-player">
            {videoPlayer.kind === "embed" ? <iframe src={videoPlayer.src} title={`Vídeo: ${item.title}`} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen /> : <video controls playsInline preload="metadata" poster={item.image}><source src={videoPlayer.src} type="video/mp4" />Seu navegador não oferece suporte à reprodução deste vídeo.</video>}
          </div>
          <div className="detail-video-meta"><span>Vídeo anúncio • Itatiaia — Anunciou, Vendeu{typeof item.attributes?.durationLabel === "string" ? ` • ${item.attributes.durationLabel}` : ""}</span>{item.videoUrl ? <a href={item.videoUrl} target="_blank" rel="noopener noreferrer">Abrir vídeo</a> : null}</div>
        </section> : null}
        <div className="detail-topline">
          <nav className="breadcrumbs" aria-label="Navegação estrutural">
            <a href="/">Início</a> › <a href="/anuncios">Classificados</a> › <a href={`/anuncios?categoria=${encodeURIComponent(item.category)}`}>{item.category}</a>
            <span aria-hidden="true"> › </span><span>{item.title}</span>
          </nav>
          <div className="detail-gallery-actions" aria-label="Ações do anúncio">
            <button className={favorite ? "active" : ""} type="button" onClick={toggleFavorite} aria-label={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"} aria-pressed={favorite}>{favorite ? "♥" : "♡"}</button>
            <a href="#compartilhar" aria-label="Compartilhar anúncio">↗</a>
          </div>
        </div>

        <header className="detail-heading">
          <div>
            <div className="detail-heading-title">
              <h1>{item.title}</h1>
              {superFeatured ? <span className="detail-featured super">Super destaque</span> : item.featured ? <span className="detail-featured">Destaque</span> : null}
            </div>
            <p><span aria-hidden="true">⌖</span> {item.property?.address || item.location} <a href={`/anuncios?categoria=${encodeURIComponent(item.category)}`}>{item.category}</a> <small>Publicado em {item.age}</small></p>
          </div>
          <strong>{staticVideo ? "Vídeo patrocinado" : item.price > 0 ? item.priceLabel : "Valor a combinar"}</strong>
        </header>

        <div className={`detail-layout ${videoPlayer ? "detail-video-layout" : ""}`.trim()}>
          <section className="detail-main-column">
            {!videoPlayer ? <div className="detail-gallery detail-gallery-primary">
              <button className="detail-photo" type="button" onClick={() => setLightboxOpen(true)} aria-label={`Ampliar foto ${photoIndex + 1} de ${photos.length}`}>
                <OptimizedImage src={shownPhoto} alt={`${item.title} - foto ${photoIndex + 1}`} width="1100" height="710" decoding="async" fetchPriority="high" />
                <span>{photoIndex + 1} / {photos.length}</span>
              </button>
              {photos.length > 1 ? <>
                <button className="gallery-arrow gallery-prev" type="button" onClick={previousPhoto} aria-label="Foto anterior">‹</button>
                <button className="gallery-arrow gallery-next" type="button" onClick={nextPhoto} aria-label="Próxima foto">›</button>
              </> : null}
              {galleryThumbnails.length > 1 ? <div className="detail-gallery-thumbs" aria-label="Outras fotos do anúncio">
                {galleryThumbnails.map((image, index) => (
                  <button className={index === photoIndex ? "active" : ""} type="button" onClick={() => { setActivePhoto(index); if (index === 6 && photos.length > 7) setLightboxOpen(true); }} aria-label={`Exibir foto ${index + 1}`} aria-pressed={index === photoIndex} key={`${image}-${index}`}>
                    <OptimizedImage src={image} alt="" width="180" height="120" loading="lazy" decoding="async" />
                    {index === 6 && photos.length > 7 ? <span>+{photos.length - 7} fotos</span> : null}
                  </button>
                ))}
              </div> : null}
            </div> : null}

            <section className="detail-block"><h2>Detalhes do anúncio</h2><div className="attribute-grid">{allDetails.filter(([, value]) => Boolean(value)).map(([label, value]) => <span key={`${label}-${value}`}><b>{label}</b>{value}</span>)}</div></section>
            {item.features?.length ? <section className="detail-block"><h2>Opcionais e diferenciais</h2><div className="detail-feature-list">{item.features.map((feature) => <span key={feature}>✓ {feature}</span>)}</div></section> : null}
            <section className="detail-block detail-description"><h2>Descrição</h2><p>{item.description}</p></section>
            {tags.length ? <section className="detail-block listing-tags"><h2>Tags</h2><div>{tags.map((tag) => <a key={tag} href={`/anuncios?busca=${encodeURIComponent(tag)}`}>{tag}</a>)}</div></section> : null}
            <section className="detail-location"><h2>Localização</h2><p>{item.property?.address || item.location}</p>{typeof item.latitude === "number" && typeof item.longitude === "number" ? <iframe className="detail-map-frame" title={`Mapa do anúncio em ${item.location}`} src={`/api/maps/embed?lat=${encodeURIComponent(item.latitude)}&lng=${encodeURIComponent(item.longitude)}&label=${encodeURIComponent(item.location)}`} loading="lazy" referrerPolicy="same-origin" allowFullScreen /> : <div className="map-card"><span>LOCALIZAÇÃO APROXIMADA</span><strong>Belo Horizonte, MG</strong><div className="map-pin">●</div></div>}</section>
          </section>

          <aside className="detail-side-stack">
            <section className="detail-side-card detail-seller-card">
              <div className="detail-seller-head">
                {item.sellerAvatar ? <OptimizedImage src={item.sellerAvatar} alt="" width="58" height="58" loading="eager" decoding="async" /> : <span className="detail-seller-avatar" aria-hidden="true">{(item.sellerName || "B").charAt(0).toUpperCase()}</span>}
                <div><small>Anunciante</small><strong>{item.sellerName || "Importador Balcão"}</strong><span>✓ Identidade verificada</span></div>
              </div>
              {staticVideo ? <div className="video-publisher-actions"><p>Conteúdo patrocinado da série Itatiaia — Anunciou, Vendeu.</p><a className="primary-button" href="/#itatiaia-anunciou-vendeu">Ver outros vídeos</a></div> : <><div className="detail-contact-actions">
                <button className="message-contact primary-chat" type="button" onClick={startChat} disabled={isListingOwner || contactBusy === "chat"}>✉ {contactBusy === "chat" ? "Abrindo chat…" : isListingOwner ? "Seu anúncio" : "Conversar pelo chat"}</button>
                <button className="phone-button" type="button" onClick={revealPhone} disabled={contactBusy === "phone"}>☎ {contactBusy === "phone" ? "Carregando…" : contactPhone}</button>
                <button className="whatsapp-contact" type="button" onClick={openWhatsApp} disabled={isListingOwner || whatsappUsed || contactBusy === "whatsapp"}>{contactBusy === "whatsapp" ? "Abrindo WhatsApp…" : isListingOwner ? "Seu anúncio" : whatsappUsed ? "Contato já iniciado" : "Chamar no WhatsApp"}</button>
              </div>
              {contactStatus ? <p className="detail-contact-status" role="status">{contactStatus}</p> : null}
              <p className="contact-consent">Ao entrar em contato, você concorda em compartilhar seus dados com o anunciante.</p></>}
              <ShareButtons slug={item.id} title={item.title} />
              {!staticVideo ? <a className="seller-listings-link" href={`/anunciantes/${encodeURIComponent(sellerSlug)}`}>Ver todos os anúncios deste anunciante</a> : null}
            </section>

            <section className="detail-side-card security"><h2>⚠ Dicas de segurança</h2><ul><li>Desconfie de preços muito abaixo do mercado.</li><li>Nunca faça pagamentos antecipados.</li><li>Confira o produto e a documentação.</li><li>Prefira negociar com usuários verificados.</li></ul></section>

            {!staticVideo ? <section className="detail-side-card proposal-card">
              <h2>Envie uma proposta</h2>
              <p>Sua proposta será encaminhada ao e-mail cadastrado pelo anunciante.</p>
              <form className="contact-form" onSubmit={submitProposal}>
                <label>Nome<input name="name" type="text" placeholder="Seu nome" minLength={2} maxLength={120} required /></label>
                <label>E-mail<input name="email" type="email" placeholder="Seu e-mail" maxLength={180} required /></label>
                <label>Telefone<input name="phone" type="tel" placeholder="Seu telefone" maxLength={30} /></label>
                <label>Proposta<textarea name="message" placeholder="Escreva sua proposta" minLength={10} maxLength={3000} required /></label>
                <button className="primary-button" type="submit" disabled={proposalBusy || proposalSent}>{proposalBusy ? "Enviando…" : proposalSent ? "Proposta enviada" : "Enviar proposta"}</button>
              </form>
              {proposalStatus ? <p className={proposalSent ? "proposal-status success" : "proposal-status"} role="status">{proposalStatus}</p> : null}
            </section> : null}
            <AdSenseUnit placement="detail-sidebar-square" format="square" />

          </aside>
        </div>

        <section className="content-section related-section"><div className="section-heading"><h2>{staticVideo ? "Outros vídeos da Itatiaia" : "Anúncios semelhantes"}</h2><a href={staticVideo ? "/#itatiaia-anunciou-vendeu" : `/anuncios?categoria=${encodeURIComponent(item.category)}`}>Ver todos ›</a></div><div className="listing-grid related">{related.map((entry) => <CompactCard item={entry} key={entry.id} />)}</div></section>
        <AdSenseUnit placement="detail-between-related-news" />
        <LatestNews />
      </div>
      {lightboxOpen && !videoPlayer ? <div className="detail-lightbox" role="dialog" aria-modal="true" aria-label={`Galeria de fotos de ${item.title}`} onClick={() => setLightboxOpen(false)}>
        <button className="lightbox-close" type="button" onClick={() => setLightboxOpen(false)} aria-label="Fechar galeria">×</button>
        <div className="lightbox-stage" onClick={(event) => event.stopPropagation()}>
          <OptimizedImage src={shownPhoto} alt={`${item.title} - foto ampliada ${photoIndex + 1}`} width="1600" height="1060" decoding="async" fetchPriority="high" />
          <span>{photoIndex + 1} / {photos.length}</span>
          {photos.length > 1 ? <><button className="lightbox-arrow previous" type="button" onClick={previousPhoto} aria-label="Foto anterior">‹</button><button className="lightbox-arrow next" type="button" onClick={nextPhoto} aria-label="Próxima foto">›</button></> : null}
        </div>
        <div className="lightbox-thumbs" onClick={(event) => event.stopPropagation()}>{photos.map((photo, index) => <button className={index === photoIndex ? "active" : ""} type="button" onClick={() => setActivePhoto(index)} aria-label={`Abrir foto ${index + 1}`} key={`${photo}-lightbox-${index}`}><OptimizedImage src={photo} alt="" width="120" height="80" loading="lazy" decoding="async" /></button>)}</div>
      </div> : null}
      <PortalFooter />
    </main>
  );
}
