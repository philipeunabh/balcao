import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  serverExternalPackages: ["postgres", "nodemailer"],
  webpack(config, { webpack }) {
    config.resolve.alias["cloudflare:workers"] = path.resolve(
      process.cwd(),
      "lib/vercel-runtime.ts",
    );
    config.resolve.alias["cloudflare:sockets"] = path.resolve(
      process.cwd(),
      "lib/cloudflare-sockets-unavailable.ts",
    );
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(/(?:^|[\\/])db[\\/]smtp$/, (resource: { request: string }) => {
        resource.request = path.resolve(process.cwd(), "db/smtp-vercel.ts");
      }),
      new webpack.NormalModuleReplacementPlugin(/^cloudflare:workers$/, (resource: { request: string }) => {
        resource.request = path.resolve(process.cwd(), "lib/vercel-runtime.ts");
      }),
      new webpack.NormalModuleReplacementPlugin(/^cloudflare:sockets$/, (resource: { request: string }) => {
        resource.request = path.resolve(process.cwd(), "lib/cloudflare-sockets-unavailable.ts");
      }),
    );
    return config;
  },
  async headers() {
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
    ];
  },
};

export default nextConfig;
