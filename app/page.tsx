import type { Metadata } from "next";
import { getHomeListings } from "../db/public-listings";
import { mapCategory } from "./categories";
import HomeClient from "./home-client";
import { ListingsBootstrap } from "./shared";
import { SITE_URL } from "../lib/site-url";

export const metadata: Metadata = {
  title: "Classificados em Belo Horizonte",
  description: "Anúncios de imóveis, veículos, celulares, eletrônicos, serviços e empregos no Portal Balcão.",
  alternates: { canonical: "/" },
};
export const revalidate = 60;

function belongsToHomeRail(item: Awaited<ReturnType<typeof getHomeListings>>[number], rail: string) {
  if (mapCategory(item.category) !== rail) return false;
  return rail !== "Veículos" || item.imported === true;
}

export default async function HomePage() {
  const listings = await getHomeListings({ regularLimit: 100, storeLimit: 12 });
  const videoListings = listings.filter((item) => typeof item.attributes?.videoUrl === "string" && item.attributes.videoUrl.trim().length > 0);
  const homeListings = [...new Map([
    ...videoListings.slice(0, 8),
    ...listings.filter((item) => item.featured).slice(0, 8),
    ...listings.filter((item) => belongsToHomeRail(item, "Veículos")).slice(0, 7),
    ...listings.slice(0, 20),
  ].map((item) => [item.id, item])).values()].slice(0, 40);
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: "Portal Balcão",
        url: SITE_URL,
        potentialAction: {
          "@type": "SearchAction",
          target: `${SITE_URL}/anuncios?busca={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "ItemList",
        itemListElement: homeListings.slice(0, 12).map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: new URL(item.url || `/anuncio/${encodeURIComponent(item.id)}`,SITE_URL).toString(),
          name: item.title,
        })),
      },
    ],
  };

  return (
    <ListingsBootstrap data={homeListings}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      <HomeClient />
    </ListingsBootstrap>
  );
}
