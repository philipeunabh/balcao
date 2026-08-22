import type { Metadata } from "next";
import { getPublicListings } from "../../db/public-listings";
import { LatestNews, ListingsBootstrap, PortalFooter, PortalHeader } from "../shared";

export const metadata: Metadata = {
  title: "Últimas notícias — Balcão News",
  description: "Últimas notícias publicadas pelo Balcão News.",
  alternates: { canonical: "/noticias" },
};

export const dynamic = "force-dynamic";

export default async function NewsPage() {
  const listings = await getPublicListings();
  return (
    <ListingsBootstrap data={listings.slice(0, 120)}>
      <main>
        <PortalHeader />
        <div className="page-shell news-page-shell"><LatestNews /></div>
        <PortalFooter />
      </main>
    </ListingsBootstrap>
  );
}
