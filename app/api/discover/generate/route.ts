import { NextResponse } from "next/server";
import { readPrivateSetting } from "../../../../db/settings";
import { getAdminFromRequest } from "../../../../db/admin-auth";

export async function POST(request: Request) {
  if (!(await getAdminFromRequest(request))) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }
  const { title, summary } = await request.json() as { title?: string; summary?: string };
  if (!title?.trim()) return NextResponse.json({ error: "Informe o título da página." }, { status: 400 });
  const apiKey = await readPrivateSetting("openai_api_key");
  if (!apiKey) return NextResponse.json({ error: "Configure a chave da OpenAI no painel administrativo." }, { status: 400 });
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: "gpt-5.2",
      store: false,
      input: `Escreva em português do Brasil um texto informativo, profissional e objetivo para a página \"${title}\" de um portal de classificados. Contexto: ${summary || "orientação para compradores e anunciantes"}. Produza de 3 a 5 parágrafos curtos, sem inventar dados, garantias ou estatísticas.`,
    }),
  });
  const data = await response.json() as { error?: { message?: string }; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  if (!response.ok) return NextResponse.json({ error: data.error?.message || "Não foi possível gerar o texto." }, { status: response.status });
  const content = data.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
  if (!content) return NextResponse.json({ error: "A API não retornou texto." }, { status: 502 });
  return NextResponse.json({ content });
}
