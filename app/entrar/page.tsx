"use client";

import { useState, type FormEvent } from "react";
import { MiniLogo, OptimizedImage } from "../shared";

export default function SignInPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [returnTo] = useState(() => {
    if (typeof window === "undefined") return "/minha-conta";
    const value = new URLSearchParams(window.location.search).get("returnTo") || "/minha-conta";
    return value.startsWith("/") && !value.startsWith("//") ? value : "/minha-conta";
  });

  const enterAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/customer/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: data.get("email"),
        password: data.get("password"),
        remember: data.get("remember") === "on",
      }),
    }).catch(() => null);
    const result = response ? await response.json().catch(() => ({})) as { error?: string } : {};
    if (!response?.ok) {
      setError(result.error || "Não foi possível entrar.");
      setBusy(false);
      return;
    }
    window.location.assign(returnTo);
  };

  return (
    <main className="customer-login-page">
      <section className="customer-login-split" aria-labelledby="customer-login-title">
        <aside className="customer-login-visual" aria-label="Classificados do Portal Balcão">
          <OptimizedImage src="/banner-home-classificados.webp" alt="Imóveis, veículos e produtos anunciados no Portal Balcão" width="1320" height="370" loading="eager" decoding="async" fetchPriority="high" />
        </aside>
        <section className="customer-login-card">
          <MiniLogo />
          <div className="customer-login-copy">
            <h1 id="customer-login-title">Entre na sua conta</h1>
            <p>Acesse seus anúncios, mensagens e favoritos.</p>
          </div>
          <form onSubmit={enterAccount}>
            <label>
              E-mail
              <input name="email" type="email" autoComplete="email" placeholder="voce@email.com" required />
            </label>
            <label>
              Senha
              <input name="password" type="password" autoComplete="current-password" placeholder="Digite sua senha" required />
            </label>
            <div className="customer-login-options">
              <label className="customer-remember"><input name="remember" type="checkbox" /><span>Lembrar de mim</span></label>
              <a className="customer-forgot" href="/recuperar-senha">Esqueci minha senha</a>
            </div>
            {error ? <div className="register-error" role="alert">{error}</div> : null}
            <button className="primary-button" type="submit" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
          </form>
          <p>Ainda não tem uma conta? <a href="/cadastro">Cadastre-se grátis</a></p>
        </section>
      </section>
    </main>
  );
}
