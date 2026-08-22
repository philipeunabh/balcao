"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { defaultDiscoverPages, DiscoverPage } from "./discover-data";
import { itatiaiaVideoListings } from "./itatiaia-videos";
import { mapCategory } from "./categories";
import {
  LatestNews,
  AdSenseUnit,
  MiartLarBanner,
  OptimizedImage,
  PortalFooter,
  PortalHeader,
  PortalListing,
  fromApi,
  useImportedListings,
} from "./shared";

const RAIL_SIZE = 5;
const ROTATION_INTERVAL = 10_000;
const MOBILE_INITIAL_SIZE = 8;
const MOBILE_MORE_SIZE = 8;

function DeferredSection({ children, minHeight = 310 }: { children: ReactNode; minHeight?: number }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || visible) return;
    if (!("IntersectionObserver" in window)) { queueMicrotask(() => setVisible(true)); return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "500px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);
  return <div ref={ref} className={`deferred-home-section ${visible ? "is-visible" : ""}`} style={{ minHeight: visible ? undefined : minHeight }}>{visible ? children : null}</div>;
}

function ListingCard({ item, favorite, toggleFavorite, badgeLabel, priority = false }: {
  item: PortalListing;
  favorite: boolean;
  toggleFavorite: (id: string) => void;
  badgeLabel?: string;
  priority?: boolean;
}) {
  return (
    <article className={`listing-card home-listing-card ${item.videoUrl ? "video-listing-card" : ""} ${/super/i.test(item.publicationType||"") ? "super-featured-listing" : item.featured ? "featured-listing" : item.storeListing ? "store-free-listing" : ""}`.trim()}>
      <a href={item.url || `/anuncio/${item.id}`} className="image-wrap" aria-label={`Abrir anúncio: ${item.title}`}>
        <OptimizedImage src={item.image} alt="" width="520" height="520" loading={priority ? "eager" : "lazy"} decoding="async" fetchPriority={priority ? "high" : "auto"} />
        {item.videoUrl ? <span className="video-play-mark" aria-hidden="true">▶</span> : null}
      </a>
      <button className={`heart ${favorite ? "active" : ""}`} onClick={() => toggleFavorite(item.id)} aria-label={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"} type="button">
        {favorite ? "♥" : "♡"}
      </button>
      <div className="card-copy">
        {/super/i.test(item.publicationType || "") ? (
          <div className="promotion-strip"><span className="promotion-red">★ Super destaque</span><span className="promotion-green">Prioridade máxima</span></div>
        ) : item.featured || badgeLabel ? (
          <div className="promotion-strip"><span className="promotion-red">{badgeLabel || "Destaque"}</span></div>
        ) : null}
        <span className="eyebrow">{item.category}</span>
        <h3><a href={item.url || `/anuncio/${item.id}`}>{item.title}</a></h3>
        <p>{item.location}</p>
        <div className="price-row"><strong>{item.price > 0 ? item.priceLabel : "Valor a combinar"}</strong></div>
      </div>
    </article>
  );
}

function VideoListingCard({ item, priority = false }: { item: PortalListing; priority?: boolean }) {
  const duration = typeof item.attributes?.durationLabel === "string" ? item.attributes.durationLabel : "";
  return (
    <article className="video-ad-card">
      <a href={`/anuncio/${item.id}`} aria-label={`Assistir ao vídeo anúncio de ${item.title}`}>
        <span className="video-ad-media">
          <OptimizedImage src={item.image} alt={`Vídeo anúncio — ${item.title}`} width="640" height="360" loading={priority ? "eager" : "lazy"} decoding="async" fetchPriority={priority ? "high" : "auto"} />
          <span className="video-ad-badge">VÍDEO ANÚNCIO</span>
          <span className="video-ad-play" aria-hidden="true">▶</span>
          {duration ? <span className="video-ad-duration">{duration}</span> : null}
        </span>
        <span className="video-ad-copy">
          <small>ITATIAIA — ANUNCIOU, VENDEU</small>
          <h3>{item.title}</h3>
          <strong>Assistir ao vídeo <span aria-hidden="true">→</span></strong>
        </span>
      </a>
    </article>
  );
}

function seededOrder(items: PortalListing[], cycle: number) {
  return items.slice().sort((a, b) => {
    const hash = (value: string) => [...value].reduce((total, letter) => (total * 31 + letter.charCodeAt(0) + cycle * 97) % 2_147_483_647, 7);
    return hash(a.id) - hash(b.id);
  });
}

function RotatingRail({ title, items, favorites, toggleFavorite, href, badgeLabel, emptyMessage, priorityCount = 0, pageSize = RAIL_SIZE, videoMode = false }: {
  title: string;
  items: PortalListing[];
  favorites: string[];
  toggleFavorite: (id: string) => void;
  href: string;
  badgeLabel?: string;
  emptyMessage?: string;
  priorityCount?: number;
  pageSize?: number;
  videoMode?: boolean;
}) {
  const [cycle, setCycle] = useState(0);
  const canRotate = videoMode ? items.length > 1 : items.length > pageSize;

  useEffect(() => {
    if (!canRotate) return;
    const timer = window.setInterval(() => setCycle((current) => current + 1), ROTATION_INTERVAL);
    return () => window.clearInterval(timer);
  }, [canRotate]);

  const visible = useMemo(() => {
    if (!videoMode) return seededOrder(items, cycle).slice(0, pageSize);
    const start = items.length ? ((cycle % items.length) + items.length) % items.length : 0;
    return Array.from({ length: Math.min(pageSize, items.length) }, (_, index) => items[(start + index) % items.length]);
  }, [items, cycle, pageSize, videoMode]);

  return (
    <section className={`content-section rotating-rail ${videoMode ? "video-rail" : ""}`.trim()} id={videoMode ? "itatiaia-anunciou-vendeu" : undefined}>
      <div className={`section-heading ${videoMode ? "video-rail-heading" : ""}`.trim()}><h2>{title}</h2>{videoMode ? <span>Vídeos patrocinados</span> : <a href={href}>Ver todos ›</a>}</div>
      {visible.length ? (
        <div className="rail-body">
          {canRotate ? <button className="rail-arrow rail-arrow-previous" type="button" onClick={() => setCycle((current) => current - 1)} aria-label={`Ver anúncios anteriores de ${title}`}>‹</button> : null}
          <div className="listing-grid">
            {visible.map((item, index) => videoMode
              ? <VideoListingCard key={item.id} item={item} priority={index < priorityCount} />
              : <ListingCard key={item.id} item={item} favorite={favorites.includes(item.id)} toggleFavorite={toggleFavorite} badgeLabel={badgeLabel} priority={index < priorityCount} />)}
          </div>
          {canRotate ? <button className="rail-arrow rail-arrow-next" type="button" onClick={() => setCycle((current) => current + 1)} aria-label={`Ver mais anúncios de ${title}`}>›</button> : null}
        </div>
      ) : <p className="empty-rail">{emptyMessage || "Nenhum anúncio disponível nesta categoria."}</p>}
      {videoMode && visible.length ? <><div className="video-slider-dots" aria-hidden="true">{items.map((item, index) => <span className={((cycle % items.length) + items.length) % items.length === index ? "active" : ""} key={item.id} />)}</div><a className="video-rail-all" href={href}>Ver todos →</a></> : null}
    </section>
  );
}

function MobileLatest({ items }: { items: PortalListing[] }) {
  const [visibleCount, setVisibleCount] = useState(MOBILE_INITIAL_SIZE);
  const [randomCycle, setRandomCycle] = useState(0);
  const lastInteraction = useRef(0);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    lastInteraction.current = Date.now();
    const recordInteraction = () => {
      lastInteraction.current = Date.now();
      setRandomCycle(0);
    };
    const options = { passive: true } as const;
    window.addEventListener("pointerdown", recordInteraction, options);
    window.addEventListener("touchstart", recordInteraction, options);
    window.addEventListener("scroll", recordInteraction, options);
    window.addEventListener("keydown", recordInteraction);
    const timer = window.setInterval(() => {
      if (Date.now() - lastInteraction.current >= ROTATION_INTERVAL) setRandomCycle((current) => current + 1);
    }, ROTATION_INTERVAL);
    return () => {
      window.removeEventListener("pointerdown", recordInteraction);
      window.removeEventListener("touchstart", recordInteraction);
      window.removeEventListener("scroll", recordInteraction);
      window.removeEventListener("keydown", recordInteraction);
      window.clearInterval(timer);
    };
  }, []);

  const ordered = useMemo(() => randomCycle > 0 ? seededOrder(items, randomCycle) : items, [items, randomCycle]);
  const visible = ordered.slice(0, visibleCount);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || visibleCount >= items.length || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisibleCount((current) => Math.min(current + MOBILE_MORE_SIZE, items.length));
    }, { rootMargin: "350px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [items.length, visibleCount]);

  return (
    <section className="mobile-home" aria-label="Anúncios mais recentes">
      <div className="mobile-home-heading"><div><span>Classificados Balcão</span><h1>Últimos anúncios</h1></div></div>
      <div className="mobile-listings">
        {visible.map((item, index) => {
          const position = index + 1;
          const showAd = (position <= MOBILE_INITIAL_SIZE && position % 6 === 0) || (position > MOBILE_INITIAL_SIZE && (position - MOBILE_INITIAL_SIZE) % MOBILE_MORE_SIZE === 0);
          return <Fragment key={item.id}>
            <a className="mobile-listing" href={item.url || `/anuncio/${item.id}`}>
              <OptimizedImage src={item.image} alt="" width="96" height="96" loading={index < 3 ? "eager" : "lazy"} decoding="async" fetchPriority={index === 0 ? "high" : "auto"} />
              <div><span>{item.category}</span><h2>{item.title}</h2><strong>{item.price > 0 ? item.priceLabel : "Valor a combinar"}</strong><small>{item.age}</small></div>
              <i aria-hidden="true">›</i>
            </a>
            {showAd ? <AdSenseUnit placement={`home-feed-${position}`} /> : null}
          </Fragment>;
        })}
      </div>
      <div ref={loadMoreRef} className="mobile-scroll-sentinel" aria-hidden="true" />
      {visibleCount < items.length ? <button className="mobile-more-results" type="button" onClick={() => setVisibleCount((current) => Math.min(current + MOBILE_MORE_SIZE, items.length))}>Carregar mais</button> : null}
    </section>
  );
}

function DiscoverGrid() {
  const [pages, setPages] = useState<DiscoverPage[]>(defaultDiscoverPages);
  useEffect(() => {
    fetch("/api/settings").then((response) => response.json()).then((data) => {
      if (Array.isArray(data.discover_pages) && data.discover_pages.length) setPages(data.discover_pages);
    }).catch(() => undefined);
  }, []);
  return (
    <section className="discover">
      <div className="section-heading"><h2>Descubra</h2></div>
      <div className="discover-grid">{pages.filter((page) => page.active).slice(0, 10).map((page) => (
        <a href={`/descubra/${page.slug}`} key={page.id}>
          <OptimizedImage src={page.image} alt="" width="640" height="360" loading="lazy" decoding="async" />
          <strong>{page.title}</strong><span>{page.summary}</span>
        </a>
      ))}</div>
    </section>
  );
}

const popularSearches = ["Chevrolet Onix", "Apartamento para alugar", "iPhone", "Notebook", "Moto usada", "Casa com piscina", "Vagas de emprego", "Móveis", "Serviços", "Terrenos"];

export default function HomeClient() {
  const { items, loading } = useImportedListings();
  const [favorites, setFavorites] = useState<string[]>([]);
  const [deferredItems, setDeferredItems] = useState<PortalListing[]>([]);
  const catalogSentinel = useRef<HTMLDivElement>(null);
  const catalog = useMemo(() => [
    ...itatiaiaVideoListings,
    ...[...items, ...deferredItems].filter((item, index, source) => !itatiaiaVideoListings.some((video) => video.id === item.id) && source.findIndex((candidate) => candidate.id === item.id) === index),
  ], [items, deferredItems]);
  const sorted = useMemo(() => catalog.slice().sort((a, b) => {
    const rank=(item:PortalListing)=>/super/i.test(item.publicationType||"")?4:item.featured?3:item.storeListing?1:2;
    const promoted=rank(b)-rank(a); if(promoted)return promoted;
    const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
    const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
    return bTime - aTime;
  }), [catalog]);

  useEffect(() => {
    const node = catalogSentinel.current;
    if (!node || deferredItems.length || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      fetch("/api/listings?view=home")
        .then((response) => response.ok ? response.json() : Promise.reject())
        .then((payload: { data?: Parameters<typeof fromApi>[0][] }) => setDeferredItems(Array.isArray(payload.data) ? payload.data.map(fromApi) : []))
        .catch(() => undefined);
    }, { rootMargin: "700px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [deferredItems.length]);

  const rails = useMemo(() => {
    const categoryOf = (item: PortalListing) => mapCategory(item.category);
    const classified = sorted.filter((item) => item.status !== "video-static");
    return {
      videos: sorted.filter((item) => item.status === "video-static" || (Boolean(item.videoUrl) && !item.id.startsWith("video-demo-"))),
      vehicles: classified.filter((item) => categoryOf(item) === "Veículos" && item.imported === true),
      properties: classified.filter((item) => categoryOf(item) === "Imóveis"),
      jobs: classified.filter((item) => categoryOf(item) === "Empregos"),
      business: classified.filter((item) => categoryOf(item) === "Comércio e Negócios"),
      technology: classified.filter((item) => categoryOf(item) === "Informática"),
      animals: classified.filter((item) => categoryOf(item) === "Animais"),
    };
  }, [sorted]);

  const toggleFavorite = (id: string) => setFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  return (
    <main>
      <PortalHeader />
      <MiartLarBanner className="home-top-banner" priority />
      <div className="mobile-video-showcase">
        <RotatingRail title="Itatiaia - Anunciou, Vendeu" items={rails.videos} favorites={favorites} toggleFavorite={toggleFavorite} href="/videos" badgeLabel="Vídeo" priorityCount={1} emptyMessage="Nenhum anúncio em vídeo disponível no momento." pageSize={1} videoMode />
      </div>
      <MobileLatest items={sorted} />
      <div className="page-shell desktop-home">
        {loading ? <p className="home-loading" role="status">Carregando anúncios…</p> : null}
        <RotatingRail title="Itatiaia - Anunciou, Vendeu" items={rails.videos} favorites={favorites} toggleFavorite={toggleFavorite} href="/anuncios?video=1" badgeLabel="Vídeo" priorityCount={2} emptyMessage="Nenhum anúncio em vídeo disponível no momento." pageSize={4} videoMode />
        <RotatingRail title="Veículos" items={rails.vehicles} favorites={favorites} toggleFavorite={toggleFavorite} href="/anuncios?categoria=Ve%C3%ADculos" />
        <div ref={catalogSentinel} className="home-catalog-sentinel" aria-hidden="true" />
        <DeferredSection><RotatingRail title="Imóveis" items={rails.properties} favorites={favorites} toggleFavorite={toggleFavorite} href="/anuncios?categoria=Im%C3%B3veis" /></DeferredSection>
        <DeferredSection minHeight={250}><AdSenseUnit placement="home-large-between-rows" format="large" /></DeferredSection>
        <DeferredSection minHeight={150}><MiartLarBanner className="desktop-inline-banner" /></DeferredSection>
        <DeferredSection><RotatingRail title="Empregos" items={rails.jobs} favorites={favorites} toggleFavorite={toggleFavorite} href="/anuncios?categoria=Empregos" /></DeferredSection>
        <DeferredSection><RotatingRail title="Transferência de negócios, cotas e clubes" items={rails.business} favorites={favorites} toggleFavorite={toggleFavorite} href="/anuncios?categoria=Com%C3%A9rcio%20e%20Neg%C3%B3cios" /></DeferredSection>
        <DeferredSection minHeight={150}><MiartLarBanner className="desktop-inline-banner" /></DeferredSection>
        <DeferredSection><RotatingRail title="Tecnologia" items={rails.technology} favorites={favorites} toggleFavorite={toggleFavorite} href="/anuncios?categoria=Inform%C3%A1tica" /></DeferredSection>
        <DeferredSection><RotatingRail title="Animais" items={rails.animals} favorites={favorites} toggleFavorite={toggleFavorite} href="/anuncios?categoria=Animais" /></DeferredSection>
        <DeferredSection minHeight={380}><DiscoverGrid /></DeferredSection>
        <DeferredSection minHeight={140}><section className="popular-searches"><h2>Buscas mais populares</h2><div>{popularSearches.map((term) => <a key={term} href={`/anuncios?busca=${encodeURIComponent(term)}`}>{term}</a>)}</div></section></DeferredSection>
        <DeferredSection minHeight={420}><LatestNews /></DeferredSection>
      </div>
      <PortalFooter />
    </main>
  );
}
