import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/admin/", "/comercial/", "/minha-conta/", "/api/", "/entrar", "/cadastro", "/anunciar", "/editar-anuncio/", "/favoritos"] },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
