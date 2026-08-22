import { readPrivateSetting } from "./settings";

type PagBankLink = { rel?: string; href?: string };
type PagBankCheckout = { id?: string; reference_id?: string; status?: string; links?: PagBankLink[]; payments?: Array<Record<string, unknown>> };
type PagBankQrCode = { expiration_date?: string; text?: string; links?: Array<PagBankLink & { media?: string }> };
type PagBankOrder = { id?: string; reference_id?: string; qr_codes?: PagBankQrCode[]; charges?: Array<Record<string, unknown>> };
type PagBankPublicKey = { public_key?: string; publicKey?: string };
type PaymentCustomer = { name: string; email: string; taxId: string; whatsapp: string };

async function config() {
  const [token, environment, email, pixEnabled, cardEnabled] = await Promise.all([
    readPrivateSetting("pagbank_token"), readPrivateSetting("pagbank_environment"), readPrivateSetting("pagbank_email"),
    readPrivateSetting("pagbank_pix_enabled"), readPrivateSetting("pagbank_card_enabled"),
  ]);
  return {
    token, email, environment: environment === "production" ? "production" : "sandbox",
    pixEnabled: String(pixEnabled) !== "false", cardEnabled: String(cardEnabled) !== "false",
    baseUrl: environment === "production" ? "https://api.pagseguro.com" : "https://sandbox.api.pagseguro.com",
  };
}

export async function getPagBankConfiguration() { return config(); }

export async function getPagBankPublicKey() {
  const { token, baseUrl } = await config();
  if (!token) throw new Error("PAGBANK_NOT_CONFIGURED");
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  let response = await fetch(`${baseUrl}/public-keys/card`, { headers });
  if (response.status === 404) {
    response = await fetch(`${baseUrl}/public-keys`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "card" }),
    });
  }
  const payload = await response.json().catch(() => ({})) as PagBankPublicKey;
  const publicKey = payload.public_key || payload.publicKey;
  if (!response.ok || !publicKey) throw new Error(`PAGBANK_PUBLIC_KEY_FAILED:${response.status}`);
  return publicKey;
}

export async function testPagBankIntegration(input?: { token?: string; environment?: string }) {
  const stored = await config(); const token = input?.token?.trim() || stored.token;
  const baseUrl = (input?.environment || stored.environment) === "production" ? "https://api.pagseguro.com" : "https://sandbox.api.pagseguro.com";
  if (!token) throw new Error("PAGBANK_NOT_CONFIGURED");
  let response = await fetch(`${baseUrl}/public-keys/card`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  if (response.status === 404) response = await fetch(`${baseUrl}/public-keys`, { method: "POST", headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ type: "card" }) });
  const payload = await response.json().catch(() => ({})) as PagBankPublicKey;
  if (!response.ok || !(payload.public_key || payload.publicKey)) throw new Error(`PAGBANK_AUTH_FAILED:${response.status}`);
  return { ok: true, authenticated: true, cardEncryptionReady: true, environment: (input?.environment || stored.environment) === "production" ? "production" : "sandbox" };
}

function idempotencyKey(prefix: string, listingId: string) {
  return `${prefix}${listingId}${crypto.randomUUID()}`.replace(/[^a-zA-Z0-9]/g, "").slice(0, 160);
}

function callbackUrl(origin: string) {
  const parsed = new URL(origin);
  if (parsed.protocol !== "https:") throw new Error("PAGBANK_CALLBACK_INVALID");
  return `${parsed.origin}/api/payments/pagbank/webhook`;
}

async function postOrder(baseUrl: string, token: string, payload: Record<string, unknown>, key: string) {
  const request = () => fetch(`${baseUrl}/orders`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json", "x-idempotency-key": key },
    body: JSON.stringify(payload),
  });
  let response = await request();
  if ([502, 503, 504].includes(response.status)) response = await request();
  const body = await response.json().catch(() => ({})) as PagBankOrder & { error_messages?: Array<{ code?: string; description?: string }> };
  if (!response.ok) {
    const code = body.error_messages?.[0]?.code?.replace(/[^A-Z0-9_-]/gi, "").slice(0, 60) || "UNKNOWN";
    throw new Error(`PAGBANK_ORDER_FAILED:${response.status}:${code}`);
  }
  return body;
}

function customerPayload(customer: PaymentCustomer) {
  const digits = customer.whatsapp.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  return {
    name: customer.name.slice(0, 120),
    email: customer.email,
    tax_id: customer.taxId.replace(/\D/g, ""),
    phones: digits.length >= 10 ? [{ country: "55", area: digits.slice(0, 2), number: digits.slice(2), type: "MOBILE" }] : undefined,
  };
}

function expirationDate(minutes = 30) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

async function resolveQrCode(qrCode: PagBankQrCode, token: string) {
  const base64Url = qrCode.links?.find((link) => link.media === "text/plain" || link.rel === "QRCODE.BASE64")?.href;
  const pngUrl = qrCode.links?.find((link) => link.media === "image/png" || link.rel === "QRCODE.PNG")?.href;
  let qrCodeImage: string | undefined;
  if (base64Url) {
    const imageResponse = await fetch(base64Url, { headers: { Authorization: `Bearer ${token}`, Accept: "text/plain" } });
    if (imageResponse.ok) {
      const encoded = (await imageResponse.text()).trim().replace(/^data:image\/png;base64,/, "");
      if (encoded) qrCodeImage = `data:image/png;base64,${encoded}`;
    }
  }
  if (!qrCodeImage && pngUrl) {
    const imageResponse = await fetch(pngUrl, { headers: { Authorization: `Bearer ${token}`, Accept: "image/png" } });
    if (imageResponse.ok) {
      const bytes = new Uint8Array(await imageResponse.arrayBuffer());
      let binary = "";
      for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
      if (binary) qrCodeImage = `data:image/png;base64,${btoa(binary)}`;
    }
  }
  return { qrCodeText: qrCode.text || "", qrCodeImage };
}

export async function createFeaturedCardPayment(input: { listingId: string; planLabel: string; amountCents: number; origin: string; customer: PaymentCustomer; encryptedCard?: string; savedCardToken?: string; securityCode?: string; holderName: string; installments?: number; saveCard?: boolean }) {
  const { token, baseUrl, cardEnabled } = await config(); if (!token) throw new Error("PAGBANK_NOT_CONFIGURED");
  if (!cardEnabled) throw new Error("PAGBANK_CARD_DISABLED");
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new Error("PAGBANK_INVALID_AMOUNT");
  if (!input.savedCardToken && !input.encryptedCard) throw new Error("PAGBANK_CARD_REQUIRED");
  const callback = callbackUrl(input.origin);
  const payload = await postOrder(baseUrl, token, {
      reference_id: `listing-${input.listingId}`,
      customer: customerPayload(input.customer),
      items: [{ reference_id: input.listingId, name: `Destaque ${input.planLabel} — Portal Balcão`, quantity: 1, unit_amount: input.amountCents }],
      charges: [{
        reference_id: `charge-${input.listingId}`,
        description: `Destaque ${input.planLabel} — Portal Balcão`,
        amount: { value: input.amountCents, currency: "BRL" },
        payment_method: {
          type: "CREDIT_CARD",
          installments: Math.min(3, Math.max(1, input.installments || 1)),
          capture: true,
          card: input.savedCardToken
            ? { id: input.savedCardToken, security_code: input.securityCode, store: true }
            : { encrypted: input.encryptedCard, store: input.saveCard === true },
          holder: { name: input.holderName.slice(0, 120), tax_id: input.customer.taxId.replace(/\D/g, "") },
        },
      }],
      notification_urls: [callback],
    }, idempotencyKey("card", input.listingId));
  if (!payload.id) throw new Error("PAGBANK_CARD_RESPONSE_INVALID");
  const charge = payload.charges?.[0] || {};
  const status = typeof charge.status === "string" ? charge.status.toUpperCase() : "PENDING";
  const method = charge.payment_method && typeof charge.payment_method === "object" ? charge.payment_method as Record<string, unknown> : {};
  const card = method.card && typeof method.card === "object" ? method.card as Record<string, unknown> : {};
  return {
    orderId: payload.id,
    paid: status === "PAID",
    status,
    cardBrand: typeof card.brand === "string" ? card.brand : null,
    cardLast4: typeof card.last_digits === "string" ? card.last_digits : null,
    cardToken: typeof card.id === "string" ? card.id : null,
    paidAt: typeof charge.paid_at === "string" ? charge.paid_at : null,
  };
}

export async function createFeaturedPix(input: { listingId: string; planLabel: string; amountCents: number; origin: string; customer: PaymentCustomer }) {
  const { token, baseUrl, pixEnabled } = await config(); if (!token) throw new Error("PAGBANK_NOT_CONFIGURED");
  if (!pixEnabled) throw new Error("PAGBANK_PIX_DISABLED");
  const expiresAt = expirationDate();
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new Error("PAGBANK_INVALID_AMOUNT");
  const callback = callbackUrl(input.origin);
  const payload = await postOrder(baseUrl, token, {
      reference_id: `listing-${input.listingId}`,
      customer: customerPayload(input.customer),
      items: [{ reference_id: input.listingId, name: `Destaque ${input.planLabel} — Portal Balcão`, quantity: 1, unit_amount: input.amountCents }],
      qr_codes: [{ amount: { value: input.amountCents }, expiration_date: expiresAt }],
      notification_urls: [callback],
    }, idempotencyKey("pix", input.listingId));
  const qrCode = payload.qr_codes?.[0];
  if (!payload.id || !qrCode?.text) throw new Error("PAGBANK_PIX_RESPONSE_INVALID");
  const resolved = await resolveQrCode(qrCode, token);
  return { orderId: payload.id, ...resolved, expiresAt: qrCode.expiration_date || expiresAt };
}

export async function testPagBankPixPayment(input?: { token?: string; environment?: string }) {
  const stored = await config();
  const environment = input?.environment || stored.environment;
  if (environment !== "sandbox") throw new Error("PAGBANK_TEST_REQUIRES_SANDBOX");
  const token = input?.token?.trim() || stored.token;
  if (!token) throw new Error("PAGBANK_NOT_CONFIGURED");
  const expiresAt = expirationDate(15);
  const reference = `test-${crypto.randomUUID()}`;
  const payload = await postOrder("https://sandbox.api.pagseguro.com", token, {
    reference_id: reference,
    customer: {
      name: "Cliente Teste Portal Balcao",
      email: "teste@portal-balcao.com.br",
      tax_id: "12345678909",
      phones: [{ country: "55", area: "11", number: "999999999", type: "MOBILE" }],
    },
    items: [{ reference_id: reference, name: "Teste de integracao Portal Balcao", quantity: 1, unit_amount: 100 }],
    qr_codes: [{ amount: { value: 100 }, expiration_date: expiresAt }],
  }, idempotencyKey("testpix", reference));
  const qrCode = payload.qr_codes?.[0];
  if (!payload.id || !qrCode?.text) throw new Error("PAGBANK_PIX_RESPONSE_INVALID");
  const resolved = await resolveQrCode(qrCode, token);
  return { ok: true, environment: "sandbox", orderId: payload.id, amountCents: 100, ...resolved, expiresAt: qrCode.expiration_date || expiresAt };
}

function hasPaidStatus(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasPaidStatus);
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (typeof record.status === "string" && record.status.toUpperCase() === "PAID") return true;
  return Object.values(record).some(hasPaidStatus);
}

export async function verifyFeaturedCheckout(checkoutId: string) {
  const { token, baseUrl } = await config(); if (!token) throw new Error("PAGBANK_NOT_CONFIGURED");
  const resource = checkoutId.startsWith("ORDE_") ? "orders" : "checkouts";
  const response = await fetch(`${baseUrl}/${resource}/${encodeURIComponent(checkoutId)}${resource === "checkouts" ? "?limit=20" : ""}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  if (!response.ok) throw new Error(`PAGBANK_CHECKOUT_VERIFY_FAILED:${response.status}`);
  const payload = await response.json() as PagBankCheckout & PagBankOrder;
  const collection = payload.payments || payload.charges || [];
  const first = Array.isArray(collection) && collection[0] && typeof collection[0] === "object" ? collection[0] as Record<string, unknown> : {};
  const status = typeof first.status === "string" ? first.status.toUpperCase() : typeof payload.status === "string" ? payload.status.toUpperCase() : "PENDING";
  const amount = first.amount && typeof first.amount === "object" ? first.amount as Record<string, unknown> : {};
  return { paid: hasPaidStatus(collection.length ? collection : payload), status, referenceId: typeof payload.reference_id === "string" ? payload.reference_id : "", amountCents: typeof amount.value === "number" ? amount.value : null };
}

export async function isAuthenticPagBankNotification(rawPayload: string, authenticityToken: string | null) {
  const { token } = await config();
  if (!token || !authenticityToken || !/^[a-f0-9]{64}$/i.test(authenticityToken)) return false;
  const bytes = new TextEncoder().encode(`${token}-${rawPayload}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const expected = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const left = new TextEncoder().encode(expected.toLowerCase());
  const right = new TextEncoder().encode(authenticityToken.toLowerCase());
  if (left.length !== right.length) return false;
  let difference = 0; for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}
