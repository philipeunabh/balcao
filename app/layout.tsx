import type { Metadata, Viewport } from "next";
/* eslint-disable @next/next/no-page-custom-font */
import "./globals.css";
import PwaRegister from "./pwa-register";
import AnalyticsTracker from "./analytics-tracker";
import AdSenseManualGuard from "./adsense-manual-guard";
import AiChatWidget from "./ai-chat-widget";
import NewsletterExperience from "./newsletter-experience";
import { readPortalSettings } from "../db/settings";
import { SITE_URL } from "../lib/site-url";

const DEFAULT_TITLE = "Portal Balcão — Classificados em Belo Horizonte";
const DEFAULT_DESCRIPTION = "Anúncios classificados de imóveis, veículos, celulares, eletrônicos, serviços e empregos em Belo Horizonte.";

async function portalSeoSettings() {
  return readPortalSettings().catch(() => ({} as Record<string, unknown>));
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await portalSeoSettings();
  const title = typeof settings.seo_site_title === "string" && settings.seo_site_title ? settings.seo_site_title : DEFAULT_TITLE;
  const description = typeof settings.seo_description === "string" && settings.seo_description ? settings.seo_description : DEFAULT_DESCRIPTION;
  const keywords = typeof settings.seo_keywords === "string" ? settings.seo_keywords.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 30) : [];
  const googleVerification = typeof settings.google_site_verification === "string" ? settings.google_site_verification : "";
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: title, template: "%s" },
    description,
    keywords,
    applicationName: "Portal Balcão",
    other: { "codex-preview": "development" },
    authors: [{ name: "Portal Balcão", url: SITE_URL }],
    creator: "Portal Balcão",
    publisher: "Portal Balcão",
    category: "classificados",
    referrer: "origin-when-cross-origin",
    robots: { index: true, follow: true, nocache: false, googleBot: { index: true, follow: true, noimageindex: false, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
    openGraph: { locale: "pt_BR", siteName: "Portal Balcão", type: "website", title, description, url: SITE_URL, images: [{ url: "/logo-balcao.jpg", width: 1200, height: 630, alt: "Portal Balcão" }] },
    twitter: { card: "summary_large_image", title, description, images: ["/logo-balcao.jpg"] },
    verification: googleVerification ? { google: googleVerification } : undefined,
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, statusBarStyle: "default", title: "Balcão" },
    formatDetection: { telephone: false, address: false, email: false },
    icons: {
      icon: [{ url: "/favicon.ico", sizes: "48x48" }, { url: "/icon-192.png", type: "image/png", sizes: "192x192" }],
      shortcut: "/favicon.ico",
      apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
    },
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff", colorScheme: "light" };

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const settings = await portalSeoSettings();
  const analyticsId = typeof settings.google_analytics_id === "string" && /^G-[A-Z0-9]{4,20}$/i.test(settings.google_analytics_id) ? settings.google_analytics_id.toUpperCase() : "";
  const adsenseClient = settings.adsense_enabled !== false && typeof settings.adsense_client_id === "string" && /^ca-pub-\d{10,30}$/.test(settings.adsense_client_id) ? settings.adsense_client_id : "";
  const adsenseSlot = adsenseClient && typeof settings.adsense_slot_id === "string" && /^\d{5,30}$/.test(settings.adsense_slot_id) ? settings.adsense_slot_id : "";
  const schemaEnabled = settings.seo_schema_enabled !== false;
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: "Portal Balcão", url: SITE_URL, logo: { "@type": "ImageObject", url: `${SITE_URL}/logo-balcao.jpg` } },
      { "@type": "WebSite", "@id": `${SITE_URL}/#website`, url: SITE_URL, name: "Portal Balcão", publisher: { "@id": `${SITE_URL}/#organization` }, inLanguage: "pt-BR", potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/anuncios?busca={search_term_string}` }, "query-input": "required name=search_term_string" } },
    ],
  };
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
        {schemaEnabled ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} /> : null}
      </head>
      <body className="antialiased" data-adsense-client={adsenseClient || undefined} data-adsense-slot={adsenseSlot || undefined}>
        <AdSenseManualGuard />
        <AnalyticsTracker measurementId={analyticsId} />
        {children}
        <AiChatWidget />
        <NewsletterExperience />
        <PwaRegister />
      </body>
    </html>
  );
}
