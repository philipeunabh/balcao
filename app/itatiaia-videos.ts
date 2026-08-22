import type { PortalListing } from "./shared";

type ItatiaiaVideoDefinition = {
  slug: string;
  title: string;
  advertiser: string;
  description: string;
  videoUrl: string;
  posterUrl: string;
  durationLabel: string;
};

export const itatiaiaVideos: ItatiaiaVideoDefinition[] = [
  {
    slug: "sport-e-cia",
    title: "Sport & Cia",
    advertiser: "Sport & Cia",
    description: "Conheça a Sport & Cia neste vídeo anúncio da Itatiaia.",
    videoUrl: "/videos/itatiaia-sport-e-cia-full-v2.mp4",
    posterUrl: "/videos/itatiaia-sport-e-cia-poster.webp",
    durationLabel: "00:51",
  },
  {
    slug: "plataforma-do-carro",
    title: "Plataforma do Carro",
    advertiser: "Plataforma do Carro",
    description: "Conheça a Plataforma do Carro neste vídeo anúncio da Itatiaia.",
    videoUrl: "/videos/itatiaia-plataforma-do-carro-full-v2.mp4",
    posterUrl: "/videos/itatiaia-plataforma-do-carro-poster.webp",
    durationLabel: "00:30",
  },
  {
    slug: "multiodonto",
    title: "Multiodonto",
    advertiser: "Multiodonto",
    description: "Conheça a Multiodonto neste vídeo anúncio da Itatiaia.",
    videoUrl: "/videos/itatiaia-multiodonto-full-v2.mp4",
    posterUrl: "/videos/itatiaia-multiodonto-poster.webp",
    durationLabel: "00:29",
  },
  {
    slug: "osaka",
    title: "Osaka",
    advertiser: "Osaka",
    description: "Conheça a Osaka neste vídeo anúncio da Itatiaia.",
    videoUrl: "/videos/itatiaia-osaka-full-v2.mp4",
    posterUrl: "/videos/itatiaia-osaka-poster.webp",
    durationLabel: "00:33",
  },
];

export const itatiaiaVideoListings: PortalListing[] = itatiaiaVideos.map((video, index) => ({
  id: `itatiaia-${video.slug}`,
  title: video.title,
  category: "Vídeos",
  subcategory: "Itatiaia — Anunciou, Vendeu",
  location: "Belo Horizonte - MG",
  price: 0,
  priceLabel: "Vídeo patrocinado",
  image: video.posterUrl,
  images: [video.posterUrl],
  videoUrl: video.videoUrl,
  age: "17/08/2026",
  createdAt: `2026-08-18T${String(20 - index).padStart(2, "0")}:00:00.000Z`,
  description: video.description,
  negotiationType: "Serviço",
  featured: true,
  status: "video-static",
  publicationType: "video",
  features: ["Vídeo anúncio", "Conteúdo patrocinado", "Itatiaia — Anunciou, Vendeu"],
  attributes: { durationLabel: video.durationLabel, videoFormat: "16:9" },
  sellerName: video.advertiser,
  analytics: { views: 0, pageViews: 0, sessions: 0, phoneClicks: 0, whatsappClicks: 0 },
}));

export function getItatiaiaVideoListing(id: string) {
  return itatiaiaVideoListings.find((item) => item.id === id);
}
