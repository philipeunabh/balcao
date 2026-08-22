import type { Metadata } from "next";
import { getPublicListings } from "../../db/public-listings";
import { itatiaiaVideoListings } from "../itatiaia-videos";
import { ListingsBootstrap, MiartLarBanner, OptimizedImage, PortalFooter, PortalHeader } from "../shared";

export const metadata: Metadata = {
  title: "Vídeos — Itatiaia Anunciou, Vendeu | Portal Balcão",
  description: "Assista aos vídeos de anunciantes disponíveis no Portal Balcão.",
  alternates: { canonical: "/videos" },
};
export const dynamic = "force-dynamic";

export default async function VideosPage() {
  const listings = await getPublicListings();
  const databaseVideos = listings.filter((item) => typeof item.attributes?.videoUrl === "string" && item.attributes.videoUrl.trim() && !item.id.startsWith("video-demo-"));
  const videos = [
    ...itatiaiaVideoListings.map((item) => ({ id: item.id, title: item.title, category: item.subcategory || item.category, poster: item.image, duration: String(item.attributes?.durationLabel || "Vídeo"), advertiser: item.sellerName || "Portal Balcão" })),
    ...databaseVideos.map((item) => ({ id: item.id, title: item.title, category: item.subcategory || item.category, poster: item.coverImage || item.images[0] || "/favicon.svg", duration: String(item.attributes?.durationLabel || "Vídeo"), advertiser: item.seller.name || "Anunciante" })),
  ];
  return (
    <ListingsBootstrap data={listings.slice(0, 160)}>
      <main>
        <PortalHeader />
        <div className="video-directory-shell">
          <MiartLarBanner className="video-directory-banner" priority />
          <header className="video-directory-head"><span>Itatiaia — Anunciou, Vendeu</span><h1>Vídeos disponíveis</h1><p>Selecione um vídeo para abrir o anúncio e assistir no player completo.</p></header>
          <section className="video-directory-grid" aria-label="Lista de vídeos disponíveis">
            {videos.map((video) => <a href={`/anuncio/${encodeURIComponent(video.id)}`} className="video-directory-card" key={video.id}><div><OptimizedImage src={video.poster} width="640" height="360" alt={`Miniatura do vídeo ${video.title}`} loading="lazy" decoding="async" /><span className="video-directory-badge">VÍDEO ANÚNCIO</span><i className="video-directory-play" aria-hidden="true">▶</i><time>{video.duration}</time></div><small>{video.category}</small><h2>{video.title}</h2><p>{video.advertiser}</p><strong>Assistir ao vídeo →</strong></a>)}
          </section>
        </div>
        <PortalFooter />
      </main>
    </ListingsBootstrap>
  );
}
