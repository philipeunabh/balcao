"use client";
/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-img-element */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ImgHTMLAttributes, type ReactNode } from "react";
import type { PublicListing } from "../db/public-listings";
import {
  mapCategory,
  migrateCategoryName,
  PortalCategory,
  portalCategories,
} from "./categories";

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

export type PortalListing = {
  id: string;
  url?: string;
  title: string;
  category: string;
  subcategory?: string;
  location: string;
  price: number;
  priceLabel: string;
  image: string;
  age: string;
  description: string;
  negotiationType?: string;
  attributes?: Record<string, string | number | boolean>;
  features?: string[];
  featured?: boolean;
  storeListing?: boolean;
  imported?: boolean;
  status?: string;
  publicationType?: string;
  featuredPlan?: string | null;
  paymentStatus?: string | null;
  paymentMethod?: string | null;
  paymentAmountCents?: number | null;
  paymentExpiresAt?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  createdAt?: string;
  images?: string[];
  videoUrl?: string;
  sellerName?: string;
  sellerEmail?: string;
  analytics?: { views: number; pageViews: number; sessions: number; phoneClicks: number; whatsappClicks: number };
  sellerAvatar?: string;
  property?: {
    transaction?: string;
    type?: string;
    state?: string;
    city?: string;
    neighborhood?: string;
    address?: string;
    features?: string[];
  };
  vehicle?: {
    type?: "carro" | "moto" | "caminhao" | "utilitario";
    brand?: string;
    model?: string;
    transmission?: string;
    fuel?: string;
    year?: number;
    features?: string[];
  };
};

function modernImageVariant(source: string, format: "avif" | "webp", width?: number) {
  if (source.startsWith("/api/media/")) {
    const separator = source.includes("?") ? "&" : "?";
    return `${source}${separator}format=${format}${width ? `&w=${Math.min(Math.max(Math.round(width), 160), 1920)}` : ""}`;
  }
  if (!/^https?:\/\//i.test(source)) return undefined;
  try {
    const url = new URL(source);
    if (url.hostname === "images.unsplash.com") {
      url.searchParams.set("auto", "format");
      url.searchParams.set("fm", format);
      url.searchParams.set("q", format === "avif" ? "66" : "74");
      return url.toString();
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function OptimizedImage({ src = "", alt = "", ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const source = typeof src === "string" ? src : "";
  const width = typeof props.width === "number" ? props.width : Number(props.width) || undefined;
  const avif = modernImageVariant(source, "avif", width);
  const webp = modernImageVariant(source, "webp", width);
  return (
    <picture>
      {avif ? <source srcSet={avif} type="image/avif" /> : null}
      {webp ? <source srcSet={webp} type="image/webp" /> : null}
      <img src={source} alt={alt} {...props} />
    </picture>
  );
}

export function MiartLarBanner({ className = "", priority = false }: { className?: string; priority?: boolean }) {
  const [adsenseAvailable, setAdsenseAvailable] = useState(false);
  const [adsenseReady, setAdsenseReady] = useState(false);
  const [showAdsense, setShowAdsense] = useState(false);

  useEffect(() => {
    const client = document.body.dataset.adsenseClient || "";
    const slot = document.body.dataset.adsenseSlot || "";
    const available = /^ca-pub-\d{10,30}$/.test(client) && /^\d{5,30}$/.test(slot);
    queueMicrotask(() => setAdsenseAvailable(available));
  }, []);

  useEffect(() => {
    if (!adsenseReady) return;
    const timer = window.setInterval(() => setShowAdsense((current) => !current), 10_000);
    return () => window.clearInterval(timer);
  }, [adsenseReady]);

  const adsenseVisible = showAdsense && adsenseReady;

  return (
    <div className={`rotating-ad-banner ${className}`.trim()} data-active={adsenseVisible ? "adsense" : "image"} aria-label="Publicidade">
      <a
        className="miart-lar-banner rotating-banner-image"
        href="https://miartelar.com.br"
        target="_blank"
        rel="noopener noreferrer sponsored"
        aria-label="Acessar o site Miart Lar Móveis Planejados"
        aria-hidden={adsenseVisible}
        tabIndex={adsenseVisible ? -1 : undefined}
      >
        <img
          src="/banner-miart-lar.jpg"
          alt="Miart Lar Móveis Planejados"
          width="1536"
          height="143"
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={priority ? "high" : "auto"}
        />
      </a>
      {adsenseAvailable ? <div className="rotating-banner-adsense" aria-hidden={!adsenseVisible}><AdSenseUnit placement={`rotating-${className || "content"}`} onStatusChange={setAdsenseReady} /></div> : null}
    </div>
  );
}

let manualAdSenseLoader: Promise<void> | null = null;

function loadManualAdSense() {
  if (typeof document === "undefined") return Promise.resolve();
  if (manualAdSenseLoader) return manualAdSenseLoader;
  manualAdSenseLoader = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-balcao-adsense="manual"]');
    if (existing) {
      if (existing.dataset.loaded === "true") resolve();
      else {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("ADSENSE_LOAD_ERROR")), { once: true });
      }
      return;
    }
    const script = document.createElement("script");
    script.async = true;
    script.crossOrigin = "anonymous";
    script.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js";
    script.dataset.balcaoAdsense = "manual";
    script.addEventListener("load", () => { script.dataset.loaded = "true"; resolve(); }, { once: true });
    script.addEventListener("error", () => reject(new Error("ADSENSE_LOAD_ERROR")), { once: true });
    document.head.appendChild(script);
  });
  return manualAdSenseLoader;
}

export function AdSenseUnit({ placement = "content", format = "horizontal", onStatusChange }: { placement?: string; format?: "horizontal" | "square" | "large"; onStatusChange?: (filled: boolean) => void }) {
  const [config, setConfig] = useState<{ client: string; slot: string } | null>(null);
  const initialized = useRef(false);
  const adRef = useRef<HTMLModElement | null>(null);
  const statusCallback = useRef(onStatusChange);

  useEffect(() => {
    statusCallback.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    const client = document.body.dataset.adsenseClient || "";
    const slot = document.body.dataset.adsenseSlot || "";
    if (/^ca-pub-\d{10,30}$/.test(client) && /^\d{5,30}$/.test(slot)) queueMicrotask(() => setConfig({ client, slot }));
  }, []);

  useEffect(() => {
    if (!config || initialized.current) return;
    initialized.current = true;
    void loadManualAdSense().then(() => {
      const adsWindow = window as Window & { adsbygoogle?: unknown[] };
      (adsWindow.adsbygoogle = adsWindow.adsbygoogle || []).push({});
    }).catch(() => {
      initialized.current = false;
    });
  }, [config]);

  useEffect(() => {
    const element = adRef.current;
    if (!config || !element) return;
    const syncStatus = () => {
      const status = element.getAttribute("data-ad-status");
      statusCallback.current?.(status === "filled" || Boolean(element.querySelector("iframe")));
    };
    syncStatus();
    const observer = new MutationObserver(syncStatus);
    observer.observe(element, { attributes: true, attributeFilter: ["data-ad-status"], childList: true, subtree: true });
    return () => observer.disconnect();
  }, [config]);

  if (!config) return null;
  return (
    <aside className={`adsense-unit adsense-format-${format} adsense-${placement}`} aria-label="Publicidade">
      <span>Publicidade</span>
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={format === "square"
          ? { display: "inline-block", width: "250px", height: "250px" }
          : format === "large"
            ? { display: "block", width: "100%", height: "250px", maxHeight: "250px" }
            : { display: "block", width: "100%", height: "90px", maxHeight: "90px" }}
        data-ad-client={config.client}
        data-ad-slot={config.slot}
        data-ad-format={format === "horizontal" ? "horizontal" : format === "large" ? "rectangle" : undefined}
        data-full-width-responsive={format === "square" ? undefined : "false"}
      />
    </aside>
  );
}

export const portalListings: PortalListing[] = [];

export type ApiListing = PublicListing;

export function fromApi(item: ApiListing): PortalListing {
  const mappedCategory = mapCategory(item.category, item.title);
  const savedVehicleType = String(item.attributes?.vehicleType || "");
  const vehicleType = savedVehicleType === "motos" ? "moto" : savedVehicleType === "caminhoes" ? "caminhao" : savedVehicleType === "carros" ? "carro" : /moto|yamaha|honda cg|fazer|biz/i.test(item.title)
    ? "moto"
    : /caminh|scania|volvo fh|mercedes atego/i.test(item.title)
      ? "caminhao"
      : /van|furgão|utilit|sprinter|ducato/i.test(item.title)
        ? "utilitario"
        : "carro";
  const knownBrands = [
    "Chevrolet",
    "Volkswagen",
    "Fiat",
    "Ford",
    "Toyota",
    "Honda",
    "Hyundai",
    "Renault",
    "Jeep",
    "Nissan",
    "Yamaha",
    "Kawasaki",
    "BMW",
    "Mercedes-Benz",
    "Volvo",
    "Scania",
  ];
  const brand = knownBrands.find((value) =>
    item.title.toLowerCase().includes(value.toLowerCase()),
  );
  const year =
    Number(item.title.match(/\b(19|20)\d{2}\b/)?.[0] || 0) || undefined;
  const isVehicle = mappedCategory === "Veículos";
  const sellerName = item.seller?.name;
  const sellerAvatar = item.seller?.avatar;
  const subcategory =
    item.subcategory ||
    (vehicleType === "moto"
      ? "Motos"
      : vehicleType === "caminhao"
        ? "Caminhões"
        : "Carros, vans e utilitários");
  return {
    id: item.slug || item.id,
    url: item.url || `/anuncio/${encodeURIComponent(item.id)}`,
    title: item.title,
    category: mappedCategory,
    subcategory: isVehicle ? subcategory : item.subcategory,
    location: item.locationLabel,
    latitude: item.latitude ?? undefined,
    longitude: item.longitude ?? undefined,
    price: item.price ?? 0,
    priceLabel: item.formattedPrice,
    image: item.coverImage || "/favicon.svg",
    images: item.images,
    videoUrl: typeof item.attributes?.videoUrl === "string" ? item.attributes.videoUrl : undefined,
    age: item.createdAt
      ? new Date(item.createdAt).toLocaleDateString("pt-BR")
      : "Recente",
    description:
      item.description ||
      "Entre em contato com o anunciante para mais informações.",
    featured: Boolean(item.featured),
    storeListing: Boolean(item.storeListing),
    imported: Boolean(item.imported),
    status: item.status,
    publicationType: item.publicationType,
    featuredPlan: item.featuredPlan,
    paymentStatus: item.paymentStatus,
    paymentMethod: item.paymentMethod,
    paymentAmountCents: item.paymentAmountCents,
    paymentExpiresAt: item.paymentExpiresAt,
    negotiationType: item.negotiationType,
    attributes: item.attributes,
    features: item.features || [],
    createdAt: item.createdAt || undefined,
    sellerName: sellerName || "Importador Balcão",
    sellerEmail: item.seller?.email,
    analytics: item.analytics,
    sellerAvatar,
    property: mappedCategory === "Imóveis" ? {
      transaction: item.negotiationType || (/alug|loca/i.test(`${item.title} ${item.description}`) ? "Aluguel" : /temporada/i.test(`${item.title} ${item.description}`) ? "Temporada" : "Venda"),
      type: String(item.attributes?.propertyType || (/apartamento|apto/i.test(item.title) ? "Apartamento" : /casa/i.test(item.title) ? "Casa" : /terreno|lote/i.test(item.title) ? "Terreno" : "Imóvel")),
      address: item.locationLabel,
      features: item.features || [],
    } : undefined,
    vehicle: isVehicle
      ? {
          type: vehicleType,
          brand: String(item.attributes?.brand || brand || ""),
          model: String(item.attributes?.model || (brand
            ? item.title
                .replace(new RegExp(brand, "i"), "")
                .replace(/\b(19|20)\d{2}\b.*$/, "")
                .trim()
            : "")),
          transmission: String(item.attributes?.transmission || ""),
          fuel: String(item.attributes?.fuel || ""),
          year: Number(item.attributes?.year || year || 0) || undefined,
          features: item.features || [],
        }
      : undefined,
  };
}

let listingsCache: PortalListing[] | null = null;
let listingsRequest: Promise<PortalListing[]> | null = null;
const ListingsContext = createContext<PortalListing[] | null>(null);

export function ListingsBootstrap({ data, children }: { data: ApiListing[]; children: ReactNode }) {
  const normalized = useMemo(() => data.map(fromApi), [data]);
  return <ListingsContext.Provider value={normalized}>{children}</ListingsContext.Provider>;
}

function loadImportedListings(fresh = false) {
  if (!fresh && listingsCache) return Promise.resolve(listingsCache);
  if (!fresh && listingsRequest) return listingsRequest;
  const request = fetch(fresh ? "/api/listings?fresh=1" : "/api/listings", fresh ? { cache: "no-store" } : undefined)
    .then((response) => (response.ok ? response.json() : Promise.reject()))
    .then((payload) => {
      const normalized = Array.isArray(payload.data) ? payload.data.map(fromApi) : [];
      if (normalized.length && !fresh) listingsCache = normalized;
      return normalized;
    })
    .catch(() => [])
    .finally(() => {
      if (!fresh) listingsRequest = null;
    });
  if (!fresh) listingsRequest = request;
  return request;
}

export function useImportedListings(fresh = false) {
  const bootstrapped = useContext(ListingsContext);
  const [items, setItems] = useState<PortalListing[]>(() => bootstrapped || []);
  const [loading, setLoading] = useState(() => !bootstrapped);
  const [external, setExternal] = useState(() => Boolean(bootstrapped));
  useEffect(() => {
    if (bootstrapped && !fresh) return;
    let active = true;
    loadImportedListings(fresh)
      .then((normalized) => {
        if (active && normalized.length) {
          setItems(normalized);
          setExternal(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [bootstrapped, fresh]);
  return { items, loading, external };
}

export type PortalBanner = {
  id: number;
  name?: string;
  type: "image" | "script" | "adsense";
  image?: string;
  link?: string;
  script?: string;
  startDate?: string;
  endDate?: string;
  active: boolean;
  placement?: "home" | "vehicle-category" | "property-category";
};

export const defaultBanners: PortalBanner[] = [
  {
    id: 20260804,
    name: "Banner Balcão — seu próximo negócio está aqui",
    type: "image",
    image: "/banner-carros.webp",
    link: "/anuncios?categoria=Ve%C3%ADculos",
    active: true,
    placement: "home",
  },
];

export function MiniLogo() {
  return (
    <a className="logo" href="/" aria-label="Balcão — página inicial">
      <picture>
        <source srcSet="/logo-balcao.webp" type="image/webp" />
        <img
          src="/logo-balcao.jpg"
          alt="Balcão — anunciou, vendeu"
          width="304"
          height="76"
          decoding="async"
        />
      </picture>
    </a>
  );
}

function InstantSearch({ initialListings }: { initialListings?: PortalListing[] }) {
  const bootstrapped = useContext(ListingsContext);
  const { items: loadedItems } = useImportedListings();
  const items = initialListings?.length ? initialListings : bootstrapped || loadedItems;
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const results = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    if (term.length < 2) return [];
    return items
      .filter((item) =>
        `${item.title} ${item.description}`
          .toLocaleLowerCase("pt-BR")
          .includes(term),
      )
      .slice(0, 5);
  }, [items, query]);
  const open = focused && query.trim().length >= 2;
  return (
    <div className="instant-search">
      <form className="search" action="/anuncios">
        <input
          name="busca"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 160)}
          autoComplete="off"
          aria-label="Buscar em títulos e descrições"
          placeholder="O que você procura?"
        />
        <button aria-label="Buscar" type="submit">
          ⌕
        </button>
      </form>
      {open && (
        <div
          className="search-suggestions"
          role="listbox"
          aria-label="Sugestões de anúncios"
        >
          {results.length ? (
            results.map((item) => (
              <a key={item.id} href={item.url || `/anuncio/${item.id}`} role="option" aria-selected="false">
                <OptimizedImage
                  src={item.image}
                  alt=""
                  width="64"
                  height="52"
                  loading="lazy"
                  decoding="async"
                />
                <span>
                  <b>{item.title}</b>
                  <strong>
                    {item.price > 0 ? item.priceLabel : "Valor a combinar"}
                  </strong>
                </span>
              </a>
            ))
          ) : (
            <p>Nenhum anúncio encontrado.</p>
          )}
          <a
            className="all-search-results"
            href={`/anuncios?busca=${encodeURIComponent(query)}`}
          >
            Ver mais anúncios
          </a>
        </div>
      )}
    </div>
  );
}

export function PortalHeader({ initialListings }: { initialListings?: PortalListing[] } = {}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [allOpen, setAllOpen] = useState(false);
  const [menuCategories, setMenuCategories] = useState(portalCategories);
  useEffect(() => {
    const sync = () => {
      try {
        const saved = JSON.parse(
          localStorage.getItem("balcao-categories") || "[]",
        );
        if (Array.isArray(saved) && saved.length) {
          setMenuCategories(
            saved.map((category) => {
              const migratedName = migrateCategoryName(category.name);
              const defaults = portalCategories.find(
                (item) => item.name === migratedName,
              );
              return {
                ...category,
                name: migratedName,
                showInMenu:
                  typeof category.showInMenu === "boolean"
                    ? category.showInMenu
                    : defaults?.showInMenu !== false,
                order: Number.isFinite(Number(category.order))
                  ? Number(category.order)
                  : (defaults?.order ?? 0),
              };
            }),
          );
        } else {
          setMenuCategories(portalCategories);
        }
      } catch {
        setMenuCategories(portalCategories);
      }
    };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("balcao-categories-updated", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("balcao-categories-updated", sync);
    };
  }, []);
  const requestedMenu = useMemo(() => {
    const requested = [
      ["Imóveis", "Imóveis"],
      ["Veículos", "Veículos"],
      ["Eletrônicos", "Eletrônicos, Áudio e Vídeo"],
      ["Tecnologia", "Informática"],
      ["Esportes", "Esportes e Fitness"],
      ["Serviços", "Serviços"],
      ["Empregos", "Empregos"],
      ["Animais", "Animais"],
      ["Celulares", "Celulares e Telefonia"],
    ];
    return requested.map(([label, categoryName]) => {
      const category = menuCategories.find((item) => item.name === categoryName)
        || portalCategories.find((item) => item.name === categoryName);
      return category ? { ...category, label } : null;
    }).filter((item): item is PortalCategory & { label: string } => Boolean(item));
  }, [menuCategories]);
  return (
    <>
      <header className="topbar compact">
        <button
          className="mobile-category-button"
          type="button"
          aria-label="Abrir categorias"
          aria-expanded={menuOpen}
          aria-controls="category-menu"
          onClick={() => setMenuOpen((current) => !current)}
        >
          ☰
        </button>
        <MiniLogo />
        <InstantSearch initialListings={initialListings} />
        <a className="top-phone" href="tel:+553133309600" aria-label="Ligar para anunciar no Balcão: (31) 3330-9600">
          <span>Para anunciar, ligue:</span>
          <strong>(31) 3330-9600</strong>
        </a>
        <nav className="top-actions">
          <a className="soft-button" href="/entrar">
            Entrar
          </a>
          <a className="primary-button create-listing-button" href="/anunciar">
            Criar anúncio
          </a>
        </nav>
        <a
          className="mobile-add-button"
          href="/anunciar"
          aria-label="Adicionar anúncio"
        >
          ＋
        </a>
      </header>
      <nav
        id="category-menu"
        className={`category-nav ${menuOpen ? "open" : ""}`}
        aria-label="Categorias principais"
      >
        <div className="category-scroll">
          <div className={`nav-group all-menu ${allOpen ? "open" : ""}`}>
            <button type="button" onClick={() => setAllOpen((current) => !current)} aria-expanded={allOpen}>
              <span className="all-menu-icon" aria-hidden="true">☰</span> Todas as categorias <span>⌄</span>
            </button>
            <div className="all-categories-panel">
              {menuCategories
                .slice()
                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                .map((item) => <section key={item.name}>
                  <a href={`/anuncios?categoria=${encodeURIComponent(item.name)}`}><strong>{item.name}</strong></a>
                  {item.subs.map((sub) => <a key={sub} href={`/anuncios?categoria=${encodeURIComponent(item.name)}&subcategoria=${encodeURIComponent(sub)}`}>{sub}</a>)}
                </section>)}
            </div>
          </div>
          {requestedMenu.map((item) => (
              <div className="nav-group" key={item.name}>
                <a
                  href={`/anuncios?categoria=${encodeURIComponent(item.name)}`}
                >
                  {item.label} <span>⌄</span>
                </a>
                <div className="submenu">
                  <strong>{item.label}</strong>
                  {item.subs.map((sub: string) => (
                    <a
                      key={sub}
                      href={`/anuncios?categoria=${encodeURIComponent(item.name)}&subcategoria=${encodeURIComponent(sub)}`}
                    >
                      {sub}
                    </a>
                  ))}
                </div>
              </div>
            ))}
        </div>
      </nav>
    </>
  );
}

export function VehicleCategoryBanner() {
  const [banner, setBanner] = useState<PortalBanner | null>(null);
  useEffect(() => {
    const sync = () =>
      setBanner(
        readLocalBanners().find(
          (item) =>
            item.active &&
            item.type === "image" &&
            item.placement === "vehicle-category",
        ) || null,
      );
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("balcao-banners-updated", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("balcao-banners-updated", sync);
    };
  }, []);
  const resolved: PortalBanner = banner?.image ? banner : {
    id: -1,
    name: "Banner da categoria Veículos",
    type: "image" as const,
    image: "/banner-carros.webp",
    link: "/anuncios?categoria=Ve%C3%ADculos",
    active: true,
  };
  const image = (
    <img
      src={resolved.image}
      alt={resolved.name || "Banner da categoria Veículos"}
      width="1100"
      height="90"
    />
  );
  return (
    <aside
      className="vehicle-category-banner"
      aria-label="Publicidade da categoria Veículos"
    >
      {resolved.link ? <a href={resolved.link}>{image}</a> : image}
    </aside>
  );
}

export function PropertyCategoryBanner() {
  const [banner, setBanner] = useState<PortalBanner | null>(null);
  useEffect(() => {
    const sync = () => {
      setBanner(readLocalBanners().find((item) => item.active && item.placement === "property-category") || null);
      fetch("/api/settings").then((response) => response.json()).then((data) => {
        const remote = Array.isArray(data.banners) ? data.banners as PortalBanner[] : [];
        setBanner(remote.find((item) => item.active && item.placement === "property-category") || null);
      }).catch(() => undefined);
    };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("balcao-banners-updated", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("balcao-banners-updated", sync);
    };
  }, []);
  const resolved: PortalBanner = banner || {
    id: -2,
    name: "Banner da categoria Imóveis",
    type: "image" as const,
    image: "/banner-miart-lar.jpg",
    link: "https://miartelar.com.br",
    active: true,
  };
  return <aside className="vehicle-category-banner" aria-label="Publicidade da categoria Imóveis">
    {resolved.type === "image" && resolved.image ? (resolved.link ? <a href={resolved.link}><img src={resolved.image} alt={resolved.name || "Banner de Imóveis"} width="1100" height="90" /></a> : <img src={resolved.image} alt={resolved.name || "Banner de Imóveis"} width="1100" height="90" />) : <div className="banner-script" dangerouslySetInnerHTML={{__html: resolved.script || ""}} />}
  </aside>;
}

export function readLocalBanners(): PortalBanner[] {
  if (typeof window === "undefined") return defaultBanners;
  try {
    const saved = JSON.parse(
      localStorage.getItem("balcao-banners") || "[]",
    ) as PortalBanner[];
    const today = new Date().toISOString().slice(0, 10);
    const active = saved.filter(
      (item) =>
        item.active &&
        (!item.startDate || item.startDate <= today) &&
        (!item.endDate || item.endDate >= today),
    );
    return active.length ? active : defaultBanners;
  } catch {
    return defaultBanners;
  }
}

export function PortalFooter() {
  return (
    <>
      <footer>
        <div className="footer-grid">
          <div>
            <MiniLogo />
            <p>
              O maior classificado grátis do Brasil.
              <br />
              Anunciou, vendeu!
            </p>
          </div>
          <div>
            <h3>Institucional</h3>
            <a href="/">Início</a>
            <a href="/anuncios">Todos os anúncios</a>
            <a href="/videos">Vídeos</a>
            <a href="/ao-vivo">● Ao vivo</a>
            <a href="/anunciar">Anunciar</a>
          </div>
          <div>
            <h3>Minha conta</h3>
            <a href="/entrar">Entrar</a>
            <a href="/cadastro">Cadastrar</a>
            <a href="/favoritos">Favoritos</a>
          </div>
          <div>
            <h3>Lojas e empresas</h3>
            <a href="/lojas-virtuais">Lojas Virtuais</a>
            <a href="/imobiliarias">Imobiliárias</a>
            <a href="/lojas-de-carros">Loja de Carros</a>
            <a href="/lojas">Todas as lojas</a>
          </div>
          <div>
            <h3>Acessos</h3>
            <a className="retailer-access" href="/lojista/login">
              ▦ Acesso lojista
            </a>
            <a className="commercial-access" href="/comercial/login">
              ◆ Acesso comercial
            </a>
            <a className="admin-access" href="/admin/login">
              ⚙ Acesso administrativo
            </a>
            <small>Painéis restritos para lojistas e equipes do Balcão.</small>
          </div>
        </div>
        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} Balcão. Todos os direitos reservados.
          </span>
          <span>Feito com ♥ no Brasil 🇧🇷</span>
        </div>
      </footer>
      <nav className="mobile-bottom-nav" aria-label="Navegação principal">
        <a href="/">
          <span>⌂</span>Início
        </a>
        <button type="button" onClick={() => (document.querySelector(".mobile-category-button") as HTMLButtonElement | null)?.click()}>
          <span>☰</span>Categorias
        </button>
        <a className="mobile-bottom-add" href="/anunciar">
          <span>＋</span>Publicar
        </a>
        <a href="/noticias">
          <span>▤</span>Notícias
        </a>
        <a href="/minha-conta">
          <span>♙</span>Minha conta
        </a>
      </nav>
    </>
  );
}

export function CompactCard({ item }: { item: PortalListing }) {
  const superFeatured = /super|ultra/i.test(`${item.publicationType || ""} ${item.featuredPlan || ""}`);
  return (
    <article className={`listing-card ${superFeatured ? "super-featured-listing" : item.featured ? "featured-listing" : item.storeListing ? "store-free-listing" : ""}`}>
      <a className="image-wrap" href={item.url || `/anuncio/${item.id}`}>
        <OptimizedImage src={item.image} alt="" width="400" height="282" loading="lazy" decoding="async" />
        {item.videoUrl ? <span className="video-play-mark" aria-hidden="true">▶</span> : null}
      </a>
      <button className="heart" aria-label="Adicionar aos favoritos">
        ♡
      </button>
      <div className="card-copy">
        {superFeatured ? (
          <div className="promotion-strip"><span className="promotion-red">★ Super destaque</span><span className="promotion-green">Prioridade máxima</span></div>
        ) : item.featured ? (
          <div className="promotion-strip"><span className="promotion-red">Destaque</span></div>
        ) : null}
        <span className="eyebrow">{item.storeListing ? "Loja · " : ""}{item.category}</span>
        <h3>
          <a href={item.url || `/anuncio/${item.id}`}>{item.title}</a>
        </h3>
        <p>{item.location}</p>
        <div className="price-row">
          <strong>
            {item.price > 0 ? item.priceLabel : "Valor a combinar"}
          </strong>
          <small>{item.age}</small>
        </div>
      </div>
    </article>
  );
}

export type NewsPost = {
  id: number;
  title: string;
  link: string;
  excerpt: string;
  image: string;
  date: string;
};

export function LatestNews({ title = "Últimas notícias — Balcão News" }: { title?: string } = {}) {
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch("/api/news", { cache: "no-store" });
        const data = await response.json() as { posts?: NewsPost[] };
        const normalized = Array.isArray(data.posts) ? data.posts : [];
        if (normalized.length) {
          setPosts(normalized);
          localStorage.setItem("balcao-news-cache", JSON.stringify({ at: Date.now(), posts: normalized }));
        }
      } catch {
        try {
          setPosts(JSON.parse(localStorage.getItem("balcao-news-cache") || "{}").posts || []);
        } catch {
          setPosts([]);
        }
      } finally {
        setLoaded(true);
      }
    };
    const cache = readLocal<{ at: number; posts: NewsPost[] }>(
      "balcao-news-cache",
      { at: 0, posts: [] },
    );
    queueMicrotask(() => setPosts(cache.posts));
    if (Date.now() - cache.at > 2 * 60 * 60 * 1000) load();
    const timer = window.setInterval(load, 2 * 60 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <section className="latest-news" id="balcao-news">
      <div className="section-heading">
        <h2>{title}</h2>
        <a href="/noticias">Ver todas ›</a>
      </div>
      {posts.length ? <div className="news-grid">
        {posts.map((post) => (
          <a href={post.link} target="_blank" rel="noreferrer" key={post.id}>
            <img src={post.image} alt="" />
            <div>
              <time>
                {post.date
                  ? new Date(post.date).toLocaleDateString("pt-BR")
                  : "Recente"}
              </time>
              <h3 dangerouslySetInnerHTML={{ __html: post.title }} />
              <p>{post.excerpt}</p>
            </div>
          </a>
        ))}
      </div> : <div className="news-empty" role="status">{loaded ? "As últimas notícias do Balcão News estarão disponíveis assim que a fonte de notícias responder." : "Carregando as últimas notícias do Balcão News…"}</div>}
    </section>
  );
}

export function DashboardNav({ admin = false, userName = "João Silva", memberSince = "2022" }: { admin?: boolean; userName?: string; memberSince?: string }) {
  const items = admin
    ? [
        "Painel",
        "Anúncios",
        "Usuários",
        "Categorias",
        "Balcão News",
        "Banners",
        "Instagram",
        "Relatórios",
        "Configurações",
      ]
    : [
        "Visão geral",
        "Meus anúncios",
        "Mensagens",
        "Favoritos",
        "Buscas salvas",
        "Planos",
        "Meus dados",
        "Notificações",
        "Configurações",
      ];
  return (
    <aside className="dash-nav">
      <MiniLogo />
      <div className="profile-dot">{admin ? "AD" : userName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</div>
      <strong>{admin ? "Administrador" : userName}</strong>
      <span>{admin ? "Gestão da plataforma" : `Membro desde ${memberSince}`}</span>
      <nav>
        {items.map((item, index) => (
          <a
            className={index === 0 ? "active" : ""}
            href={
              admin
                ? `#${item
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/\s+/g, "-")}`
                : "#conteudo"
            }
            key={item}
          >
            <i>{["⌂", "▤", "♙", "♡", "⌕", "◇", "♧", "◌", "⚙"][index]}</i>
            {item}
          </a>
        ))}
      </nav>
      <a className="logout" href={admin ? "/" : "/api/customer/logout"}>
        ↪ Sair
      </a>
    </aside>
  );
}
