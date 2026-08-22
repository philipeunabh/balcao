import { NextResponse } from "next/server";
import { getAdminFromRequest } from "../../../db/admin-auth";
import { getCustomerBySessionToken, readCustomerCookie } from "../../../db/customer-auth";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  const [admin, customer] = await Promise.all([
    getAdminFromRequest(request),
    getCustomerBySessionToken(readCustomerCookie(request)),
  ]);
  if (!admin && !customer) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }
  try {
    let bytes: Uint8Array;
    let contentType: string;
    let originalName = "perfil.webp";
    if (request.headers.get("content-type")?.includes("application/json")) {
      const body = await request.json().catch(() => ({})) as { dataUrl?: string; filename?: string };
      const match = String(body.dataUrl || "").match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
      if (!match || !allowedTypes.has(match[1])) {
        return NextResponse.json({ error: "A imagem enviada é inválida." }, { status: 400 });
      }
      contentType = match[1];
      const decoded = atob(match[2]);
      bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
      originalName = String(body.filename || originalName).slice(0, 180);
    } else {
      const form = await request.formData();
      const value = form.get("file");
      if (!value || typeof value === "string" || typeof value.arrayBuffer !== "function") {
        return NextResponse.json({ error: "Selecione uma imagem JPG, PNG ou WebP." }, { status: 400 });
      }
      const file = value as File;
      contentType = file.type;
      bytes = new Uint8Array(await file.arrayBuffer());
      originalName = String(file.name || originalName).slice(0, 180);
    }
    if (!allowedTypes.has(contentType)) {
      return NextResponse.json({ error: "Formato inválido. Envie uma imagem JPG, PNG ou WebP." }, { status: 400 });
    }
    if (bytes.byteLength <= 0 || bytes.byteLength > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "A foto deve ter no máximo 5 MB." }, { status: 400 });
    }
    const extension = contentType === "image/jpeg" ? "jpg" : contentType.split("/")[1];
    const owner = customer ? `customer-${customer.id}` : `admin-${admin!.id}`;
    const key = `profile-images/${owner}/${crypto.randomUUID()}.${extension}`;
    const { env } = await import("cloudflare:workers");
    await env.BUCKET.put(key, bytes, {
      httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" },
      customMetadata: { owner, originalName },
    });
    return NextResponse.json({ url: `/api/media/${encodeURIComponent(key)}` });
  } catch {
    return NextResponse.json({ error: "Não foi possível salvar a foto. Tente novamente." }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
