import type { Metadata } from "next";
import { getPublicListings } from "../../db/public-listings";
import { ListingsBootstrap } from "../shared";
import { SITE_URL } from "../../lib/site-url";
import ResultsClient from "./results-client";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export const dynamic = "force-dynamic";

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const params = await searchParams;
  const category = firstValue(params.categoria);
  const subcategory = firstValue(params.subcategoria);
  const query = firstValue(params.busca || params.q);
  const subject = subcategory || category || (query ? `Busca por ${query}` : "Todos os anúncios");
  const title = `${subject} | Portal Balcão`;
  const description = `Encontre ${subject.toLocaleLowerCase("pt-BR")} em anúncios classificados no Portal Balcão.`;
  const canonicalParams = new URLSearchParams();
  if (category) canonicalParams.set("categoria", category);
  if (subcategory) canonicalParams.set("subcategoria", subcategory);
  if (query) canonicalParams.set("busca", query);
  const canonical = `/anuncios${canonicalParams.size ? `?${canonicalParams.toString()}` : ""}`;
  return {
    title,
    description,
    alternates: { canonical },
    robots: query ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: { title, description, url: canonical, type: "website" },
  };
}

export default async function ListingsPage({ searchParams }: { searchParams: SearchParams }) {
  const [listings, params] = await Promise.all([getPublicListings(), searchParams]);
  const category = firstValue(params.categoria);
  const subcategory = firstValue(params.subcategoria);
  const filtered = listings.filter((item) =>
    (!category || item.category === category) && (!subcategory || item.subcategory === subcategory),
  );
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: subcategory || category || "Anúncios do Portal Balcão",
    itemListElement: filtered.slice(0, 50).map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: new URL(item.url || `/anuncio/${encodeURIComponent(item.id)}`,SITE_URL).toString(),
      name: item.title,
    })),
  };

  return (
    <ListingsBootstrap data={listings}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      <ResultsClient />
    </ListingsBootstrap>
  );
}
