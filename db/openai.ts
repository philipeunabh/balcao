import type { PortalCategory } from "../app/categories";
import { readPrivateSetting } from "./settings";

export const OPENAI_MODEL = "gpt-5.2";

type OpenAIResponse = {
  error?: { message?: string };
  status?: string;
  output_text?: string;
  incomplete_details?: { reason?: string };
  output?: Array<{ content?: Array<{ type?: string; text?: string; refusal?: string }> }>;
};

async function requestOpenAI(body: Record<string, unknown>, apiKeyOverride?: string) {
  const apiKey = apiKeyOverride?.trim() || await readPrivateSetting("openai_api_key");
  if (!apiKey) throw new Error("OPENAI_NOT_CONFIGURED");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: OPENAI_MODEL, store: false, ...body }),
  });
  const payload = await response.json().catch(() => ({})) as OpenAIResponse;
  if (!response.ok) throw new Error(payload.error?.message || `OPENAI_REQUEST_FAILED:${response.status}`);
  const content = payload.output?.flatMap((item) => item.content || []) || [];
  const refusal = content.find((item) => item.type === "refusal")?.refusal;
  if (refusal) throw new Error(`A OpenAI recusou a solicitação: ${refusal}`);
  if (payload.status === "incomplete") {
    const reason = payload.incomplete_details?.reason || "limite de saída";
    throw new Error(`A resposta da OpenAI ficou incompleta (${reason}).`);
  }
  const text = payload.output_text || content.find((item) => item.type === "output_text")?.text;
  if (!text?.trim()) throw new Error("A OpenAI respondeu sem conteúdo de texto. Verifique o acesso da chave ao modelo GPT-5.2.");
  return text;
}

export async function getOpenAiApiKey() {
  const apiKey = await readPrivateSetting("openai_api_key");
  if (!apiKey) throw new Error("OPENAI_NOT_CONFIGURED");
  return apiKey;
}

export async function testOpenAIIntegration(apiKeyOverride?: string) {
  const raw = await requestOpenAI({
    instructions: "Responda ao teste técnico usando exatamente o esquema JSON solicitado.",
    input: "Confirme que a integração está operacional.",
    reasoning: { effort: "none" },
    max_output_tokens: 128,
    text: { format: { type: "json_schema", name: "integration_test", strict: true, schema: {
      type: "object",
      properties: { status: { type: "string", enum: ["ok"] }, message: { type: "string" } },
      required: ["status", "message"],
      additionalProperties: false,
    } } },
  }, apiKeyOverride);
  const result = JSON.parse(raw) as { status?: string; message?: string };
  if (result.status !== "ok") throw new Error("A OpenAI não confirmou o teste de integração.");
  return { ok: true, model: OPENAI_MODEL, message: result.message || "Integração operacional." };
}

export async function chatWithPortalVisitor(input: {
  prompt?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}) {
  const transcript = input.messages.slice(-12).map((message) => `${message.role === "user" ? "Visitante" : "Assistente"}: ${message.content.slice(0, 1200)}`).join("\n");
  return requestOpenAI({
    instructions: `${input.prompt?.trim() || "Você é o assistente de atendimento do Portal Balcão, um portal brasileiro de classificados."}\nResponda em português do Brasil, de modo objetivo e profissional. Não invente anúncios, preços, usuários, pagamentos ou disponibilidade. A busca real no banco aparece em cartões separados. Oriente o visitante a usar as ações Criar conta e Criar anúncio quando necessário. Não solicite dados de cartão, senhas ou códigos de verificação na conversa livre.`,
    input: transcript || "Visitante: Olá",
    reasoning: { effort: "low" },
    max_output_tokens: 500,
  });
}

export async function generateWelcomeEmailCopy() {
  const raw = await requestOpenAI({
    instructions: "Você é o redator do Jornal Balcão, portal brasileiro de classificados. Crie um e-mail de boas-vindas objetivo, confiável e sem promessas inventadas. Escreva em português do Brasil.",
    input: "Crie o texto para uma pessoa que acabou de assinar os e-mails do Jornal Balcão. Convide-a a pesquisar anúncios e a publicar um anúncio.",
    reasoning: { effort: "low" }, max_output_tokens: 600,
    text: { format: { type: "json_schema", name: "welcome_email", strict: true, schema: { type: "object", properties: { subject: { type: "string", maxLength: 90 }, heading: { type: "string", maxLength: 90 }, intro: { type: "string", maxLength: 500 }, cta: { type: "string", maxLength: 40 } }, required: ["subject","heading","intro","cta"], additionalProperties: false } } },
  });
  return JSON.parse(raw) as {subject:string;heading:string;intro:string;cta:string};
}

export async function generateNewsletterCampaignCopy(listings:Array<{title:string;category:string;formattedPrice:string}>) {
  const raw=await requestOpenAI({
    instructions:"Você é editor de e-mail marketing do Jornal Balcão. Use somente os anúncios fornecidos como contexto. Não invente preços, descontos, disponibilidade ou características. Produza texto curto, informativo e profissional em português do Brasil.",
    input:`Crie a abertura de uma campanha semanal com estes anúncios:\n${listings.slice(0,20).map((item,index)=>`${index+1}. ${item.title} | ${item.category} | ${item.formattedPrice}`).join("\n")}`,
    reasoning:{effort:"low"},max_output_tokens:700,
    text:{format:{type:"json_schema",name:"newsletter_campaign",strict:true,schema:{type:"object",properties:{subject:{type:"string",maxLength:100},preheader:{type:"string",maxLength:150},heading:{type:"string",maxLength:100},intro:{type:"string",maxLength:600}},required:["subject","preheader","heading","intro"],additionalProperties:false}}},
  });
  return JSON.parse(raw) as {subject:string;preheader:string;heading:string;intro:string};
}

export async function extractStoreCatalogWithOpenAI(input:{sourceUrl:string;pageText:string}) {
  const raw=await requestOpenAI({
    instructions:"Extraia somente produtos ou anúncios realmente presentes no conteúdo do site. Não invente itens, preços, imagens ou links. Valores devem ser numéricos em reais. Preserve URLs absolutas quando existirem.",
    input:`URL de origem: ${input.sourceUrl}\n\nConteúdo visível:\n${input.pageText.slice(0,60000)}`,
    reasoning:{effort:"low"},max_output_tokens:6000,
    text:{format:{type:"json_schema",name:"store_catalog",strict:true,schema:{type:"object",properties:{items:{type:"array",maxItems:80,items:{type:"object",properties:{title:{type:"string"},description:{type:"string"},price:{type:["number","null"]},category:{type:"string"},subcategory:{type:"string"},address:{type:"string"},image:{type:["string","null"]},url:{type:["string","null"]}},required:["title","description","price","category","subcategory","address","image","url"],additionalProperties:false}}},required:["items"],additionalProperties:false}}}
  });
  const parsed=JSON.parse(raw) as {items?:Record<string,unknown>[]}; return Array.isArray(parsed.items)?parsed.items:[];
}

export type AiImportedListingDraft = {
  sourceUrl: string;
  title: string;
  description: string;
  priceCents: number | null;
  category: string;
  subcategory: string;
  negotiationType: string;
  address: string;
  images: string[];
  externalUrl: string;
  features: string[];
  confidence: number;
};

export async function extractListingUrlWithOpenAI(input: {
  sourceUrl: string;
  pageText: string;
  imageCandidates: string[];
  categories: Pick<PortalCategory, "name" | "subs">[];
}) {
  const categoryNames = input.categories.map((item) => item.name);
  const subcategoryNames = [...new Set(input.categories.flatMap((item) => item.subs))];
  const catalog = input.categories.map((item) => `${item.name}: ${item.subs.join(" | ")}`).join("\n");
  const raw = await requestOpenAI({
    instructions: "Você extrai um único produto, imóvel, veículo, serviço ou oferta de uma página pública para criar um rascunho de anúncio. Use somente informações presentes no conteúdo fornecido. Não invente preço, características, endereço, disponibilidade ou imagens. Escolha uma combinação válida do catálogo. Retorne o preço total em centavos de real ou null. Selecione apenas URLs de imagem da lista fornecida. Produza título claro e descrição completa em português do Brasil, preservando os fatos da origem.",
    input: `URL DE ORIGEM: ${input.sourceUrl}\n\nCATÁLOGO VÁLIDO:\n${catalog}\n\nIMAGENS ENCONTRADAS:\n${input.imageCandidates.slice(0, 40).join("\n") || "Nenhuma"}\n\nCONTEÚDO DA PÁGINA:\n${input.pageText.slice(0, 65000)}`,
    reasoning: { effort: "low" },
    max_output_tokens: 2200,
    text: { format: { type: "json_schema", name: "listing_url_import", strict: true, schema: {
      type: "object",
      properties: {
        title: { type: "string", minLength: 5, maxLength: 120 },
        description: { type: "string", minLength: 20, maxLength: 5000 },
        priceCents: { type: ["integer", "null"], minimum: 0 },
        category: { type: "string", enum: categoryNames },
        subcategory: { type: "string", enum: subcategoryNames },
        negotiationType: { type: "string", enum: ["Venda", "Aluguel", "Troca", "Compra", "Temporada", "Serviço", "Outra"] },
        address: { type: "string", maxLength: 240 },
        images: { type: "array", maxItems: 12, items: { type: "string" } },
        features: { type: "array", maxItems: 16, items: { type: "string", maxLength: 80 } },
        confidence: { type: "integer", minimum: 0, maximum: 100 },
      },
      required: ["title", "description", "priceCents", "category", "subcategory", "negotiationType", "address", "images", "features", "confidence"],
      additionalProperties: false,
    } } },
  });
  const parsed = JSON.parse(raw) as Omit<AiImportedListingDraft, "sourceUrl" | "externalUrl">;
  const parent = input.categories.find((item) => item.name === parsed.category);
  if (!parent?.subs.includes(parsed.subcategory)) throw new Error("OPENAI_INVALID_CATEGORY_PAIR");
  const allowedImages = new Set(input.imageCandidates);
  return {
    ...parsed,
    sourceUrl: input.sourceUrl,
    externalUrl: input.sourceUrl,
    title: parsed.title.trim().slice(0, 120),
    description: parsed.description.trim().slice(0, 5000),
    address: parsed.address.trim().slice(0, 240),
    images: parsed.images.filter((url) => allowedImages.has(url)).slice(0, 12),
    features: parsed.features.map((item) => item.trim()).filter(Boolean).slice(0, 16),
  } satisfies AiImportedListingDraft;
}

export async function classifyListingWithOpenAI(input: {
  title: string;
  description: string;
  currentCategory: string;
  currentSubcategory: string;
  categories: Pick<PortalCategory, "name" | "subs">[];
}) {
  const categoryNames = input.categories.map((item) => item.name);
  const subcategoryNames = [...new Set(input.categories.flatMap((item) => item.subs))];
  if (!categoryNames.length || !subcategoryNames.length) throw new Error("CATEGORY_CATALOG_EMPTY");
  const catalog = input.categories.map((item) => `${item.name}: ${item.subs.join(" | ")}`).join("\n");
  const raw = await requestOpenAI({
    instructions: "Você classifica anúncios de um portal brasileiro. Use exclusivamente uma combinação válida do catálogo fornecido. Não crie categorias. Analise o produto ou serviço principal anunciado.",
    input: `CATÁLOGO:\n${catalog}\n\nANÚNCIO:\nTítulo: ${input.title}\nDescrição: ${input.description.slice(0, 4000)}\nCategoria atual: ${input.currentCategory}\nSubcategoria atual: ${input.currentSubcategory}`,
    reasoning: { effort: "low" },
    max_output_tokens: 500,
    text: {
      format: {
        type: "json_schema",
        name: "listing_classification",
        strict: true,
        schema: {
          type: "object",
          properties: {
            category: { type: "string", enum: categoryNames },
            subcategory: { type: "string", enum: subcategoryNames },
            confidence: { type: "integer", minimum: 0, maximum: 100 },
            reason: { type: "string", maxLength: 240 },
          },
          required: ["category", "subcategory", "confidence", "reason"],
          additionalProperties: false,
        },
      },
    },
  });
  const result = JSON.parse(raw) as { category: string; subcategory: string; confidence: number; reason: string };
  const parent = input.categories.find((item) => item.name === result.category);
  if (!parent?.subs.includes(result.subcategory)) throw new Error("OPENAI_INVALID_CATEGORY_PAIR");
  return result;
}

export type ListingAiDraft = {
  score: number;
  summary: string;
  issues: string[];
  suggestedTitle: string;
  suggestedDescription: string;
  seoKeywords: string[];
  imageStatus: "boa" | "melhorar" | "substituir" | "sem_imagem";
  imageNotes: string;
  imagePrompt: string;
};

function listingMultimodalInput(input: { title: string; description: string; category: string; subcategory: string; imageUrl?: string; extra?: string }) {
  const text = `ANÚNCIO\nTítulo atual: ${input.title}\nCategoria: ${input.category}\nSubcategoria: ${input.subcategory}\nDescrição atual: ${input.description.slice(0, 6000)}${input.extra ? `\n\n${input.extra}` : ""}`;
  const content: Array<Record<string, unknown>> = [{ type: "input_text", text }];
  if (input.imageUrl && /^https?:\/\//i.test(input.imageUrl)) content.push({ type: "input_image", image_url: input.imageUrl, detail: "high" });
  return [{ role: "user", content }];
}

export async function reviewListingWithOpenAI(input: { title: string; description: string; category: string; subcategory: string; imageUrl?: string }) {
  const raw = await requestOpenAI({
    instructions: "Você é editor sênior de um portal brasileiro de classificados. Analise somente os dados fornecidos, sem inventar características. Crie título SEO natural com no máximo 60 caracteres e descrição profissional, clara e persuasiva. Avalie a foto principal quando ela estiver disponível. O prompt de imagem deve pedir apenas melhoria técnica, preservando fielmente produto, imóvel, veículo, pessoas, marcas, textos e cenário.",
    input: listingMultimodalInput(input),
    reasoning: { effort: "low" },
    max_output_tokens: 1800,
    text: { format: { type: "json_schema", name: "listing_editorial_review", strict: true, schema: {
      type: "object",
      properties: {
        score: { type: "integer", minimum: 0, maximum: 100 },
        summary: { type: "string", maxLength: 500 },
        issues: { type: "array", items: { type: "string", maxLength: 240 }, maxItems: 10 },
        suggestedTitle: { type: "string", minLength: 5, maxLength: 60 },
        suggestedDescription: { type: "string", minLength: 80, maxLength: 4000 },
        seoKeywords: { type: "array", items: { type: "string", maxLength: 60 }, maxItems: 12 },
        imageStatus: { type: "string", enum: ["boa", "melhorar", "substituir", "sem_imagem"] },
        imageNotes: { type: "string", maxLength: 500 },
        imagePrompt: { type: "string", maxLength: 900 },
      },
      required: ["score", "summary", "issues", "suggestedTitle", "suggestedDescription", "seoKeywords", "imageStatus", "imageNotes", "imagePrompt"],
      additionalProperties: false,
    } } },
  });
  return JSON.parse(raw) as ListingAiDraft;
}

export async function chatWithListingAgent(input: {
  title: string; description: string; category: string; subcategory: string; imageUrl?: string;
  agentInstructions: string; messages: Array<{ role: "user" | "assistant"; content: string }>;
}) {
  const transcript = input.messages.slice(-12).map((message) => `${message.role === "user" ? "Administrador" : "Agente"}: ${message.content}`).join("\n");
  const raw = await requestOpenAI({
    instructions: `Você é um agente revisor de anúncios dentro do dashboard do Portal Balcão. Siga estas instruções personalizadas:\n${input.agentInstructions.slice(0, 5000)}\nConverse em português do Brasil. Não invente dados do anúncio. Quando o administrador pedir melhoria, prepare rascunhos completos. Nunca diga que publicou ou alterou algo; a publicação depende de confirmação no dashboard.`,
    input: listingMultimodalInput({ ...input, extra: `CONVERSA ATUAL:\n${transcript}` }),
    reasoning: { effort: "low" },
    max_output_tokens: 1800,
    text: { format: { type: "json_schema", name: "listing_agent_reply", strict: true, schema: {
      type: "object",
      properties: {
        reply: { type: "string", minLength: 2, maxLength: 1800 },
        suggestedTitle: { type: "string", maxLength: 60 },
        suggestedDescription: { type: "string", maxLength: 4000 },
        imageAction: { type: "string", enum: ["none", "improve"] },
        imagePrompt: { type: "string", maxLength: 900 },
      },
      required: ["reply", "suggestedTitle", "suggestedDescription", "imageAction", "imagePrompt"],
      additionalProperties: false,
    } } },
  });
  return JSON.parse(raw) as { reply: string; suggestedTitle: string; suggestedDescription: string; imageAction: "none" | "improve"; imagePrompt: string };
}

export async function editListingImageWithOpenAI(input: { imageUrl: string; prompt: string }) {
  const apiKey = await getOpenAiApiKey();
  const source = await fetch(input.imageUrl);
  if (!source.ok) throw new Error("Não foi possível carregar a imagem original.");
  const sourceBlob = await source.blob();
  if (!sourceBlob.type.startsWith("image/")) throw new Error("A imagem original não é válida.");
  const form = new FormData();
  form.set("model", "gpt-image-1.5");
  form.set("image", new File([sourceBlob], "anuncio-original.webp", { type: sourceBlob.type || "image/webp" }));
  form.set("prompt", `${input.prompt.slice(0, 1200)} Preserve rigorosamente o conteúdo real da foto. Não adicione produtos, cômodos, acessórios, pessoas, marcas, textos ou características inexistentes. Apenas corrija nitidez, iluminação, enquadramento, ruído e equilíbrio de cores para uso profissional em classificados.`);
  form.set("size", "1536x1024");
  form.set("quality", "medium");
  form.set("output_format", "webp");
  const response = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { authorization: `Bearer ${apiKey}` }, body: form });
  const payload = await response.json().catch(() => ({})) as { data?: Array<{ b64_json?: string; url?: string }>; error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || `OPENAI_IMAGE_FAILED:${response.status}`);
  const result = payload.data?.[0];
  if (result?.b64_json) {
    const binary = atob(result.b64_json); const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return { bytes, contentType: "image/webp" };
  }
  if (result?.url) {
    const generated = await fetch(result.url); if (!generated.ok) throw new Error("Não foi possível baixar a imagem melhorada.");
    return { bytes: new Uint8Array(await generated.arrayBuffer()), contentType: generated.headers.get("content-type") || "image/webp" };
  }
  throw new Error("A OpenAI não retornou a imagem melhorada.");
}
