import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  serverExternalPackages: ["postgres", "nodemailer"],
  turbopack: {
    resolveAlias: {
      "cloudflare:workers": "./lib/vercel-runtime.ts",
      "cloudflare:sockets": "./lib/cloudflare-sockets-unavailable.ts",
    },
  },
  webpack(config) {
    config.module.rules.push({
      test: /pdf\.worker\.min\.mjs$/,
      resourceQuery: /url/,
      type: "asset/resource",
    });
    config.resolve.alias["cloudflare:workers"] = path.resolve(
      process.cwd(),
      "lib/vercel-runtime.ts",
    );
    config.resolve.alias["cloudflare:sockets"] = path.resolve(
      process.cwd(),
      "lib/cloudflare-sockets-unavailable.ts",
    );
    return config;
  },
  async headers() {
    const publicAssets = [
      "/logo-balcao.jpg",
      "/logo-balcao.webp",
      "/banner-miart-lar.jpg",
      "/favicon.ico",
      "/icon-192.png",
      "/icon-512.png",
      "/apple-touch-icon.png",
    ];
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self), payment=(self)" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
      {
        source: "/",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, s-maxage=60, stale-while-revalidate=86400" }],
      },
      {
        source: "/publicidade-legal",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, s-maxage=60, stale-while-revalidate=86400" }],
      },
      {
        source: "/assets/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/videos/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=2592000, stale-while-revalidate=86400" }],
      },
      ...publicAssets.map((source) => ({
        source,
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }],
      })),
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
