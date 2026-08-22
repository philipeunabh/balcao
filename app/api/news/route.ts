import { NextResponse } from "next/server";
import { readPortalSettings } from "../../../db/settings";

type WordPressPost = Record<string, unknown>;
const DEFAULT_WORDPRESS_API = "https://balcaonews.com.br";

function postsEndpoint(base: string) {
  const url = new URL(base);
  const path = url.pathname.replace(/\/$/, "");
  if (!path.includes("/wp-json/")) url.pathname = `${path}/wp-json/wp/v2/posts`;
  else if (/\/wp-json$/i.test(path)) url.pathname = `${path}/wp/v2/posts`;
  url.searchParams.set("_embed", "1");
  url.searchParams.set("per_page", "10");
  return url.toString();
}

function normalize(post: WordPressPost) {
  const embedded = post._embedded as { ["wp:featuredmedia"]?: { source_url?: string }[] } | undefined;
  return {
    id: Number(post.id),
    title: String((post.title as { rendered?: string })?.rendered || "Notícia"),
    link: String(post.link || "#"),
    excerpt: String((post.excerpt as { rendered?: string })?.rendered || "").replace(/<[^>]+>/g, ""),
    image: embedded?.["wp:featuredmedia"]?.[0]?.source_url || "/favicon.svg",
    date: String(post.date || ""),
  };
}

export async function GET() {
  const settings = await readPortalSettings();
  const base = typeof settings.wordpress_api_url === "string" && settings.wordpress_api_url.trim() ? settings.wordpress_api_url.trim() : DEFAULT_WORDPRESS_API;
  try {
    const response = await fetch(postsEndpoint(base), { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`WORDPRESS_${response.status}`);
    const data = await response.json() as WordPressPost[];
    const posts = Array.isArray(data) ? data.slice(0, 10).map(normalize) : [];
    return NextResponse.json({ posts, configured: true }, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } });
  } catch {
    return NextResponse.json({ posts: [], configured: true, unavailable: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }
}
