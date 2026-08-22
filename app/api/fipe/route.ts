import { NextRequest, NextResponse } from "next/server";

const allowed = new Set(["carros", "motos", "caminhoes"]);

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type") || "carros";
  const brand = request.nextUrl.searchParams.get("brand");
  if (!allowed.has(type)) return NextResponse.json({ error: "Tipo inválido." }, { status: 400 });
  const path = brand ? `${type}/marcas/${encodeURIComponent(brand)}/modelos` : `${type}/marcas`;
  try {
    const response = await fetch(`https://parallelum.com.br/fipe/api/v1/${path}`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("FIPE indisponível");
    const payload = await response.json();
    if (brand) {
      const raw = Array.isArray(payload?.modelos) ? payload.modelos : [];
      return NextResponse.json({ models: raw.map((item: { codigo: number; nome: string }) => ({ code: String(item.codigo), name: item.nome })) });
    }
    const raw = Array.isArray(payload) ? payload : [];
    return NextResponse.json({ brands: raw.map((item: { codigo: string; nome: string }) => ({ code: String(item.codigo), name: item.nome })) });
  } catch {
    return NextResponse.json({ error: "Não foi possível consultar a tabela FIPE." }, { status: 502 });
  }
}
