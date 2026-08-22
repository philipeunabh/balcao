"use client";

type EncryptResult = { encryptedCard?: string; hasErrors?: boolean; errors?: Array<{ message?: string }> };
declare global { interface Window { PagSeguro?: { encryptCard: (input: { publicKey: string; holder: string; number: string; expMonth: string; expYear: string; securityCode: string }) => EncryptResult } } }

let sdkPromise: Promise<void> | null = null;
function loadSdk() {
  if (window.PagSeguro) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-pagbank-sdk="true"]');
    const script = existing || document.createElement("script");
    script.dataset.pagbankSdk = "true"; script.src = "https://assets.pagseguro.com.br/checkout-sdk-js/rc/dist/browser/pagseguro.min.js"; script.async = true;
    script.addEventListener("load", () => window.PagSeguro ? resolve() : reject(new Error("SDK do PagBank indisponível.")), { once: true });
    script.addEventListener("error", () => reject(new Error("Não foi possível carregar a segurança do PagBank.")), { once: true });
    if (!existing) document.head.appendChild(script);
  });
  return sdkPromise;
}

export async function encryptPagBankCard(form: FormData) {
  const holder = String(form.get("cardHolder") || "").trim(); const number = String(form.get("cardNumber") || "").replace(/\D/g, "");
  const expMonth = String(form.get("cardExpMonth") || "").replace(/\D/g, ""); const expYear = String(form.get("cardExpYear") || "").replace(/\D/g, ""); const securityCode = String(form.get("cardSecurityCode") || "").replace(/\D/g, "");
  if (holder.length < 3 || number.length < 13 || number.length > 19 || !/^(0?[1-9]|1[0-2])$/.test(expMonth) || expYear.length !== 4 || securityCode.length < 3) throw new Error("Confira o nome, número, validade e código de segurança do cartão.");
  const response = await fetch("/api/payments/pagbank/public-key", { headers: { Accept: "application/json" } });
  const data = await response.json().catch(() => ({})) as { publicKey?: string; error?: string };
  if (!response.ok || !data.publicKey) throw new Error(data.error || "Não foi possível iniciar o pagamento com cartão.");
  await loadSdk();
  const result = window.PagSeguro?.encryptCard({ publicKey: data.publicKey, holder, number, expMonth: expMonth.padStart(2, "0"), expYear, securityCode });
  if (!result?.encryptedCard || result.hasErrors) throw new Error(result?.errors?.[0]?.message || "Os dados do cartão não foram aceitos.");
  return { encryptedCard: result.encryptedCard, cardHolderName: holder, installments: Number(form.get("cardInstallments") || 1), saveCard: form.get("saveCard") === "on" };
}

export function PagBankCardFields() {
  return <div className="inline-card-fields"><div className="listing-fields two"><label className="full">Nome impresso no cartão<input name="cardHolder" autoComplete="cc-name" required placeholder="Nome completo" /></label><label className="full">Número do cartão<input name="cardNumber" inputMode="numeric" autoComplete="cc-number" required maxLength={23} onInput={(event) => { const input = event.currentTarget; input.value = input.value.replace(/\D/g, "").slice(0, 19).replace(/(.{4})/g, "$1 ").trim(); }} placeholder="0000 0000 0000 0000" /></label><label>Mês<input name="cardExpMonth" inputMode="numeric" autoComplete="cc-exp-month" required maxLength={2} placeholder="MM" /></label><label>Ano<input name="cardExpYear" inputMode="numeric" autoComplete="cc-exp-year" required maxLength={4} placeholder="AAAA" /></label><label>CVV<input name="cardSecurityCode" type="password" inputMode="numeric" autoComplete="cc-csc" required maxLength={4} placeholder="CVV" /></label><label>Parcelamento<select name="cardInstallments" defaultValue="1"><option value="1">1x sem juros</option><option value="2">2x</option><option value="3">3x</option></select></label><label className="check full"><input name="saveCard" type="checkbox" />Salvar este cartão com segurança no PagBank</label></div><p className="card-privacy-note">Os dados são criptografados no navegador. O Portal Balcão nunca recebe nem armazena o número completo do cartão ou o CVV.</p></div>;
}
