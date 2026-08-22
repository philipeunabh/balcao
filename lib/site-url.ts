const FALLBACK_SITE_URL = "https://jornalbalcao.com.br";

function normalizedSiteUrl(value: string | undefined) {
  try {
    const url = new URL(value || FALLBACK_SITE_URL);
    if (url.protocol !== "https:" && url.hostname !== "localhost") return FALLBACK_SITE_URL;
    return url.origin;
  } catch {
    return FALLBACK_SITE_URL;
  }
}

export const SITE_URL = normalizedSiteUrl(
  process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL,
);

export function absoluteSiteUrl(pathname: string) {
  return new URL(pathname, SITE_URL).toString();
}
