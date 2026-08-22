export function connect(): never {
  throw new Error("Cloudflare sockets are not available in the Vercel runtime.");
}
