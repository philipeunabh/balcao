"use client";
/* eslint-disable @next/next/no-html-link-for-pages */

import { FormEvent, useState } from "react";
import { MiniLogo } from "../../shared";

export default function CommercialLoginPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/commercial/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: data.get("email"), password: data.get("password"), remember: data.get("remember") === "on" }),
    });
    if (response.ok) { location.href = "/comercial"; return; }
    const payload = await response.json().catch(() => ({})) as { error?: string };
    setError(payload.error || "Não foi possível entrar.");
    setBusy(false);
  }
  return (
    <main className="commercial-login-page">
      <section className="commercial-login-card">
        <MiniLogo />
        <span className="commercial-login-icon">▣</span>
        <span className="hero-kicker">Equipe de vendas</span>
        <h1>Acesso comercial</h1>
        <p>Área exclusiva para cadastrar anunciantes, criar anúncios, vender destaques e realizar aprovações.</p>
        <form onSubmit={login}>
          <label>E-mail comercial<input name="email" type="email" autoComplete="username" required /></label>
          <label>Senha<input name="password" type="password" autoComplete="current-password" required /></label>
          {error ? <div className="login-error" role="alert">{error}</div> : null}
          <label className="check"><input name="remember" type="checkbox" defaultChecked /> Manter conectado</label>
          <button className="primary-button wide" type="submit" disabled={busy}>{busy ? "Entrando…" : "Entrar na área comercial"}</button>
        </form>
        <a className="back-site" href="/">← Voltar para o site</a>
      </section>
    </main>
  );
}
