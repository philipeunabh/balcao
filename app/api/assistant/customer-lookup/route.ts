import { NextResponse } from "next/server";
import { findCustomerForChatLookup, isValidCpf, onlyDigits } from "../../../../db/customer-auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const taxId = onlyDigits(String(body.taxId || ""));
  const email = String(body.email || "").trim().toLowerCase();
  const whatsapp = onlyDigits(String(body.whatsapp || ""));
  if (!isValidCpf(taxId)) return NextResponse.json({ error: "Informe um CPF válido." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Informe um e-mail válido." }, { status: 400 });
  if (whatsapp.length < 10 || whatsapp.length > 13) return NextResponse.json({ error: "Informe um WhatsApp válido com DDD." }, { status: 400 });
  const result = await findCustomerForChatLookup(email,taxId,whatsapp);
  if (!result.exists && result.conflict) return NextResponse.json({ error: "Os dados não correspondem ao mesmo cadastro. Entre com sua senha ou fale com o suporte." }, { status: 409 });
  return NextResponse.json(result);
}

export const dynamic = "force-dynamic";
