import type { Metadata } from "next";
import { cache } from "react";
import { getHomeListings, getPublicListing } from "../../../db/public-listings";
import { getItatiaiaVideoListing } from "../../itatiaia-videos";
import { ListingsBootstrap } from "../../shared";
import ListingDetailsClient from "./details-client";
import { SITE_URL } from "../../../lib/site-url";

export const revalidate = 60;
const getListing = cache(getPublicListing);

function absoluteUrl(value: string) {
  try { return new URL(value, SITE_URL).toString(); }
  catch { return `${SITE_URL}/logo-balcao.jpg`; }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const item = await getListing(slug);
  const videoItem = getItatiaiaVideoListing(slug);
  const resolved = item || videoItem;
  const title = resolved ? `${resolved.title} | Portal Balcão` : "Anúncio não encontrado | Portal Balcão";
  const description = resolved?.description.slice(0, 220) || "Consulte anúncios classificados no Portal Balcão.";
  const image = absoluteUrl(item?.coverImage || videoItem?.image || "/logo-balcao.jpg");
  const canonical = `/anuncio/${encodeURIComponent(slug)}`;
  return {
    title,
    description,
    alternates: { canonical },
    robots: resolved ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { type: "website", locale: "pt_BR", url: canonical, siteName: "Portal Balcão", title, description, images: [{ url: image, alt: resolved?.title || "Portal Balcão" }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function ListingDetailsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [item, listings] = await Promise.all([getListing(slug), getHomeListings({ regularLimit: 28, storeLimit: 4 })]);
  const videoItem = getItatiaiaVideoListing(slug);
  const detailListings = item
    ? [item, ...listings.filter((candidate) => candidate.id !== item.id && candidate.category === item.category).slice(0, 12)]
    : videoItem ? listings.slice(0, 12) : [];
  const canonical = `${SITE_URL}/anuncio/${encodeURIComponent(slug)}`;
  const resolved = item || videoItem;
  const videoUrl = videoItem?.videoUrl || (typeof item?.attributes?.videoUrl === "string" ? item.attributes.videoUrl : "");
  const durationLabel = String(videoItem?.attributes?.durationLabel || item?.attributes?.durationLabel || "");
  const durationMatch = durationLabel.match(/(?:(\d+):)?(\d{1,2}):(\d{2})/);
  const duration = durationMatch ? `PT${durationMatch[1] ? `${Number(durationMatch[1])}H` : ""}${Number(durationMatch[2]) ? `${Number(durationMatch[2])}M` : ""}${Number(durationMatch[3])}S` : undefined;
  const structuredData = resolved ? videoUrl ? {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: resolved.title,
    description: resolved.description,
    thumbnailUrl: [absoluteUrl(videoItem?.image || item?.coverImage || "/logo-balcao.jpg")],
    contentUrl: absoluteUrl(videoUrl),
    embedUrl: canonical,
    uploadDate: item?.createdAt || videoItem?.createdAt || "2026-08-17T00:00:00-03:00",
    ...(duration ? { duration } : {}),
    publisher: { "@type": "Organization", name: "Portal Balcão", logo: { "@type": "ImageObject", url: `${SITE_URL}/logo-balcao.jpg` } },
  } : {
    "@context": "https://schema.org",
    "@type": "Product",
    name: resolved.title,
    description: resolved.description,
    image: item?.images.length ? item.images.map(absoluteUrl) : [absoluteUrl(item?.coverImage || "/logo-balcao.jpg")],
    url: canonical,
    category: resolved.category,
    offers: {
      "@type": "Offer",
      priceCurrency: "BRL",
      ...(resolved.price ? { price: resolved.price } : {}),
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/UsedCondition",
      url: canonical,
      seller: { "@type": "Organization", name: item?.seller.name || "Portal Balcão" },
    },
  } : null;

  return (
    <ListingsBootstrap data={detailListings}>
      {structuredData ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} /> : null}
      <ListingDetailsClient key={slug} slug={slug} videoItem={videoItem} />
    </ListingsBootstrap>
  );
}
