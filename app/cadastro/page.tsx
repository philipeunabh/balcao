"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { MiniLogo } from "../shared";

type AccountType = "particular" | "empresa";
type VerificationState = {
  registrationId: string;
  email: string;
  whatsapp: string;
  deliveryChannels: ("email" | "whatsapp")[];
};

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function maskCpf(value: string) {
  return digits(value).slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function maskCnpj(value: string) {
  return digits(value).slice(0, 14)
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

function maskPhone(value: string) {
  const raw = digits(value);
  const number = (raw.startsWith("55") && raw.length >= 12 ? raw.slice(2) : raw).slice(0, 11);
  if (number.length <= 10) return number.replace(/(\d{2})(\d{0,4})(\d{0,4})/, (_, ddd, first, last) => `(${ddd}${ddd.length === 2 ? ") " : ""}${first}${last ? `-${last}` : ""}`);
  return number.replace(/(\d{2})(\d{0,5})(\d{0,4})/, (_, ddd, first, last) => `(${ddd}) ${first}${last ? `-${last}` : ""}`);
}

function maskEmail(value: string) {
  const [name, domain] = value.split("@");
  if (!domain) return value;
  return `${name.slice(0, 2)}${"*".repeat(Math.max(2, name.length - 2))}@${domain}`;
}

function maskDestinationPhone(value: string) {
  const number = digits(value);
  return number.length >= 4 ? `(**) *****-${number.slice(-4)}` : value;
}

export default function RegisterPage() {
  const [accountType, setAccountType] = useState<AccountType>("particular");
  const [taxId, setTaxId] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [verification, setVerification] = useState<VerificationState | null>(null);
  const [code, setCode] = useState("");
  const documentLabel = accountType === "particular" ? "CPF" : "CNPJ";

  const chooseType = (value: AccountType) => {
    setAccountType(value);
    setTaxId("");
    setError("");
  };

  const updateTaxId = (event: ChangeEvent<HTMLInputElement>) => {
    setTaxId(accountType === "particular" ? maskCpf(event.target.value) : maskCnpj(event.target.value));
  };

  const startRegistration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/customer/register/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountType,
        taxId,
        email: form.get("email"),
        name: form.get("name"),
        whatsapp,
        password: form.get("password"),
      }),
    }).catch(() => null);
    const result = response ? await response.json().catch(() => ({})) as Record<string, unknown> : {};
    if (!response?.ok) {
      setError(typeof result.error === "string" ? result.error : "Não foi possível iniciar o cadastro.");
      setBusy(false);
      return;
    }
    if (result.verificationRequired !== true) {
      window.location.assign(typeof result.redirect === "string" ? result.redirect : "/anunciar");
      return;
    }
    setVerification({
      registrationId: String(result.registrationId),
      email: String(result.email),
      whatsapp: String(result.whatsapp),
      deliveryChannels: Array.isArray(result.deliveryChannels)
        ? result.deliveryChannels.filter((channel): channel is "email" | "whatsapp" => channel === "email" || channel === "whatsapp")
        : [],
    });
    setBusy(false);
  };

  const verifyCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!verification) return;
    setBusy(true);
    setError("");
    const response = await fetch("/api/customer/register/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registrationId: verification.registrationId, code }),
    }).catch(() => null);
    const result = response ? await response.json().catch(() => ({})) as Record<string, unknown> : {};
    if (!response?.ok) {
      setError(typeof result.error === "string" ? result.error : "Não foi possível validar o código.");
      setBusy(false);
      return;
    }
    window.location.assign(typeof result.redirect === "string" ? result.redirect : "/anunciar");
  };

  return (
    <main className="customer-register-page">
      <section className="customer-register-card" aria-labelledby="register-title">
        <MiniLogo />
        <h1 id="register-title">Crie sua conta grátis</h1>
        <p className="register-plan-note"><strong>Plano Gratuito</strong><span>10 anúncios incluídos</span></p>
        <form onSubmit={startRegistration}>
          <fieldset className="account-type-choice">
            <legend>Tipo de cadastro</legend>
            <button className={accountType === "particular" ? "active" : ""} type="button" onClick={() => chooseType("particular")} aria-pressed={accountType === "particular"}>Particular</button>
            <button className={accountType === "empresa" ? "active" : ""} type="button" onClick={() => chooseType("empresa")} aria-pressed={accountType === "empresa"}>Empresa</button>
          </fieldset>
          <label>{accountType === "particular" ? "Nome completo" : "Nome da empresa"}<input name="name" type="text" autoComplete="name" placeholder={accountType === "particular" ? "Seu nome completo" : "Razão social ou nome fantasia"} maxLength={120} required /></label>
          <label>{documentLabel}<input name="taxId" value={taxId} onChange={updateTaxId} inputMode="numeric" autoComplete="off" placeholder={accountType === "particular" ? "000.000.000-00" : "00.000.000/0000-00"} required /></label>
          <label>E-mail<input name="email" type="email" autoComplete="email" placeholder="voce@email.com" required /></label>
          <label>WhatsApp<input name="whatsapp" type="tel" value={whatsapp} onChange={(event) => setWhatsapp(maskPhone(event.target.value))} inputMode="tel" autoComplete="tel" placeholder="(31) 99999-9999" required /><small>Se o Send Code estiver ativo, o código será enviado para este número.</small></label>
          <label>Senha<input name="password" type="password" autoComplete="new-password" placeholder="Mínimo de 8 caracteres" minLength={8} required /><small>Use letras e números.</small></label>
          {!verification && error ? <div className="register-error" role="alert">{error}</div> : null}
          <button className="primary-button" type="submit" disabled={busy}>{busy ? "Enviando código…" : "Cadastrar grátis"}</button>
        </form>
        <p className="register-signin">Já tem uma conta? <a href="/entrar">Entrar</a></p>
      </section>
      {verification ? <div className="register-code-modal" role="presentation">
        <section className="verification-step" role="dialog" aria-modal="true" aria-labelledby="verification-title" aria-describedby="verification-description">
          <button className="register-modal-close" type="button" aria-label="Fechar e corrigir os dados" onClick={() => { setVerification(null); setCode(""); setError(""); }}>×</button>
          <span className="verification-icon" aria-hidden="true">4</span>
          <h1 id="verification-title">Informe o código</h1>
          <p id="verification-description">Enviamos quatro números para ativar sua conta:</p>
          {verification.deliveryChannels.includes("email") ? <strong>{maskEmail(verification.email)}</strong> : null}
          {verification.deliveryChannels.includes("whatsapp") ? <strong>WhatsApp {maskDestinationPhone(verification.whatsapp)}</strong> : null}
          <form onSubmit={verifyCode}>
            <label htmlFor="verification-code">Código de ativação</label>
            <input id="verification-code" className="verification-code" value={code} onChange={(event) => setCode(digits(event.target.value).slice(0, 4))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{4}" maxLength={4} placeholder="0000" autoFocus required />
            {error ? <div className="register-error" role="alert">{error}</div> : null}
            <button className="primary-button" type="submit" disabled={busy || code.length !== 4}>{busy ? "Validando…" : "Ativar minha conta"}</button>
          </form>
          <button className="register-back" type="button" onClick={() => { setVerification(null); setCode(""); setError(""); }}>Corrigir meus dados</button>
        </section>
      </div> : null}
    </main>
  );
}
