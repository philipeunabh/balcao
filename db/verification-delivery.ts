import { readPortalSettings } from "./settings";
import { SITE_URL } from "../lib/site-url";
import { sendWapiText } from "./wapi";

type RuntimeValues = Record<string, unknown>;

function requiredString(runtime: RuntimeValues, key: string) {
  const value = runtime[key];
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] || character);
}

const settingKeyMap = {
  RESEND_API_KEY: "resend_api_key",
  VERIFICATION_EMAIL_FROM: "verification_email_from",
  WAPI_TOKEN: "wapi_token",
  WAPI_INSTANCE_ID: "wapi_instance_id",
} as const;

async function getDeliveryConfig() {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as RuntimeValues;
  const settings = await readPortalSettings().catch(() => ({} as Record<string, unknown>));
  const pairs = Object.entries(settingKeyMap).map(([envKey, settingKey]) => {
    const environmentValue = requiredString(runtime, envKey);
    const storedValue = settings[settingKey];
    return [envKey, environmentValue || (typeof storedValue === "string" ? storedValue.trim() : "")] as const;
  });
  return Object.fromEntries(pairs) as Record<keyof typeof settingKeyMap, string>;
}

export async function getVerificationChannels() {
  const config = await getDeliveryConfig();
  const settings = await readPortalSettings().catch(() => ({} as Record<string, unknown>));
  const enabledValue = settings.registration_code_enabled;
  const enabled = enabledValue === true || enabledValue === "true" || enabledValue === 1 || enabledValue === "1";
  return {
    enabled,
    email: enabled && Boolean(config.RESEND_API_KEY && config.VERIFICATION_EMAIL_FROM),
    whatsapp: enabled && Boolean(config.WAPI_TOKEN && config.WAPI_INSTANCE_ID),
    config,
  };
}

async function sendEmail(input: { email: string; name: string; code: string }, config: Awaited<ReturnType<typeof getDeliveryConfig>>) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.VERIFICATION_EMAIL_FROM,
      to: [input.email],
      subject: "Código de confirmação — Portal Balcão",
      html: `<div style="font-family:Poppins,Arial,sans-serif;color:#1b1d22;line-height:1.55"><h2>Confirme seu cadastro</h2><p>Olá, ${escapeHtml(input.name)}.</p><p>Use este código para concluir seu cadastro no Portal Balcão:</p><p style="font-size:30px;font-weight:800;letter-spacing:8px;color:#d71920">${input.code}</p><p>O código é válido por 10 minutos. Não compartilhe este código.</p></div>`,
      text: `Olá, ${input.name}. Seu código de confirmação do Portal Balcão é ${input.code}. Ele é válido por 10 minutos.`,
    }),
  });
  if (!response.ok) throw new Error(`EMAIL_DELIVERY_FAILED:${response.status}`);
}

async function sendWhatsApp(input: { whatsapp: string; code: string }, config: Awaited<ReturnType<typeof getDeliveryConfig>>) {
  await sendWapiText({
    token: config.WAPI_TOKEN,
    instanceId: config.WAPI_INSTANCE_ID,
    whatsapp: input.whatsapp,
    message: `Seja bem-vindo ao Jornal Balcão. Seu cadastro foi realizado. Segue abaixo o seu código para ativação do seu cadastro.\n\nCódigo: ${input.code}`,
  });
}

export async function sendVerificationCode(input: {
  email: string;
  name: string;
  whatsapp: string;
  code: string;
}) {
  const channels = await getVerificationChannels();
  const deliveries: Array<{ channel: "email" | "whatsapp"; promise: Promise<void> }> = [];
  if (channels.email) deliveries.push({ channel: "email", promise: sendEmail(input, channels.config) });
  if (channels.whatsapp) deliveries.push({ channel: "whatsapp", promise: sendWhatsApp(input, channels.config) });
  if (!deliveries.length) return [];
  const results = await Promise.allSettled(deliveries.map((delivery) => delivery.promise));
  return deliveries.flatMap((delivery, index) => results[index].status === "fulfilled" ? [delivery.channel] : []);
}

export async function sendListingCopy(input: {
  email: string; name: string; listingId: string; title: string; category: string; priceLabel: string; address: string; statusLabel: string;
}) {
  const config = await getDeliveryConfig();
  if (!config.RESEND_API_KEY || !config.VERIFICATION_EMAIL_FROM) throw new Error("LISTING_EMAIL_NOT_CONFIGURED");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: config.VERIFICATION_EMAIL_FROM, to: [input.email], subject: "Anúncio cadastrado com sucesso — Portal Balcão",
      html: `<div style="font-family:Poppins,Arial,sans-serif;color:#1b1d22;line-height:1.6"><h2>Anúncio cadastrado com sucesso!</h2><p>Olá, ${escapeHtml(input.name)}.</p><p>Ele será revisado pela nossa equipe para publicação.</p><table style="border-collapse:collapse;width:100%;max-width:620px"><tr><td style="padding:8px;border:1px solid #ddd"><strong>Código</strong></td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(input.listingId)}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>Título</strong></td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(input.title)}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>Categoria</strong></td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(input.category)}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>Valor</strong></td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(input.priceLabel)}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>Endereço</strong></td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(input.address)}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>Status</strong></td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(input.statusLabel)}</td></tr></table></div>`,
      text: `Olá, ${input.name}. Anúncio cadastrado com sucesso! Ele será revisado pela nossa equipe para publicação. Anúncio: ${input.title} (${input.listingId}). Categoria: ${input.category}. Valor: ${input.priceLabel}. Endereço: ${input.address}. Status: ${input.statusLabel}.`,
    }),
  });
  if (!response.ok) throw new Error(`LISTING_EMAIL_FAILED:${response.status}`);
}

export async function sendListingProposal(input: {
  email: string;
  advertiserName: string;
  listingId: string;
  listingTitle: string;
  senderName: string;
  senderEmail: string;
  senderPhone: string;
  message: string;
}) {
  const config = await getDeliveryConfig();
  if (!config.RESEND_API_KEY || !config.VERIFICATION_EMAIL_FROM) throw new Error("PROPOSAL_EMAIL_NOT_CONFIGURED");
  const listingUrl = `${SITE_URL}/anuncio/${encodeURIComponent(input.listingId)}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: config.VERIFICATION_EMAIL_FROM,
      to: [input.email],
      reply_to: input.senderEmail,
      subject: `Nova proposta — ${input.listingTitle}`,
      html: `<div style="font-family:Poppins,Arial,sans-serif;color:#1b1d22;line-height:1.6"><h2>Você recebeu uma nova proposta</h2><p>Olá, ${escapeHtml(input.advertiserName || "anunciante")}.</p><p><strong>${escapeHtml(input.senderName)}</strong> enviou uma proposta pelo Portal Balcão para o anúncio <a href="${listingUrl}">${escapeHtml(input.listingTitle)}</a>.</p><table style="border-collapse:collapse;width:100%;max-width:620px"><tr><td style="padding:8px;border:1px solid #ddd"><strong>E-mail</strong></td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(input.senderEmail)}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>Telefone</strong></td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(input.senderPhone || "Não informado")}</td></tr></table><div style="margin-top:16px;padding:16px;background:#f5f6f7;border-radius:8px;white-space:pre-wrap">${escapeHtml(input.message)}</div></div>`,
      text: `Nova proposta para ${input.listingTitle}. De: ${input.senderName} (${input.senderEmail}${input.senderPhone ? `, ${input.senderPhone}` : ""}). Mensagem: ${input.message}. Anúncio: ${listingUrl}`,
    }),
  });
  if (!response.ok) throw new Error(`PROPOSAL_EMAIL_FAILED:${response.status}`);
}
