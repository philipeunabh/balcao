import type { MetadataRoute } from "next";
import { getPublicListings } from "../db/public-listings";
import { listVirtualStores } from "../db/stores";
import { listPublicAdvertiserSlugs } from "../db/customer-auth";
import { itatiaiaVideoListings } from "./itatiaia-videos";
import { SITE_URL } from "../lib/site-url";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [listings, stores, advertisers] = await Promise.all([getPublicListings(), listVirtualStores().catch(() => []), listPublicAdvertiserSlugs().catch(() => [])]);
  const categories = [...new Set(listings.map((item) => item.category).filter(Boolean))];
  const subcategories = [...new Map(listings.filter((item) => item.category && item.subcategory).map((item) => [`${item.category}\u0000${item.subcategory}`, { category: item.category, subcategory: item.subcategory }])).values()];
  const now = new Date();
  return [
    { url: SITE_URL, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/anuncios`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE_URL}/videos`, changeFrequency: "daily", priority: 0.85 },
    { url: `${SITE_URL}/noticias`, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE_URL}/publicidade-legal`, changeFrequency: "daily", priority: 0.85 },
    { url: `${SITE_URL}/lojas`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/imobiliarias`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/lojas-de-carros`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/lojas-virtuais`, changeFrequency: "weekly", priority: 0.7 },
    ...stores.map((store) => ({ url: `${SITE_URL}/loja/${encodeURIComponent(store.slug)}`, changeFrequency: "daily" as const, priority: 0.8 })),
    ...advertisers.map((slug) => ({ url: `${SITE_URL}/anunciantes/${encodeURIComponent(slug)}`, changeFrequency: "daily" as const, priority: 0.75 })),
    ...categories.map((category) => ({ url: `${SITE_URL}/anuncios?categoria=${encodeURIComponent(category)}`, changeFrequency: "daily" as const, priority: 0.8 })),
    ...subcategories.map(({ category, subcategory }) => ({ url: `${SITE_URL}/anuncios?categoria=${encodeURIComponent(category)}&subcategoria=${encodeURIComponent(subcategory)}`, changeFrequency: "daily" as const, priority: 0.75 })),
    ...itatiaiaVideoListings.map((item) => ({ url: `${SITE_URL}/anuncio/${encodeURIComponent(item.id)}`, lastModified: item.createdAt ? new Date(item.createdAt) : now, changeFrequency: "weekly" as const, priority: 0.85 })),
    ...listings.slice(0, 5000).map((item) => ({ url: new URL(item.url || `/anuncio/${encodeURIComponent(item.id)}`,SITE_URL).toString(), lastModified: item.createdAt ? new Date(item.createdAt) : undefined, changeFrequency: "weekly" as const, priority: item.featured ? 0.9 : 0.7 })),
  ];
}
