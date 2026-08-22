"use client";
/* eslint-disable @next/next/no-html-link-for-pages */

import { FormEvent, useState } from "react";
import { MiniLogo } from "../../shared";

export default function AdminLoginPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: data.get("email"),
        password: data.get("password"),
        remember: data.get("remember") === "on",
      }),
    });
    if (response.ok) {
      location.href = "/admin";
      return;
    }
    const payload = await response.json().catch(() => ({})) as { error?: string };
    setError(payload.error || "Não foi possível entrar.");
    setBusy(false);
  }
  return <main className="admin-login-page"><section className="admin-login-card"><MiniLogo /><span className="admin-lock">⚙</span><span className="hero-kicker">Área restrita</span><h1>Acesso administrativo</h1><p>Entre com suas credenciais para gerenciar anúncios, usuários, categorias e configurações do Balcão.</p><form onSubmit={login}><label>E-mail administrativo<input name="email" type="email" defaultValue="philipeuna@gmail.com" autoComplete="username" required /></label><label>Senha<input name="password" type="password" placeholder="Digite sua senha" autoComplete="current-password" required /></label>{error && <div className="login-error" role="alert">{error}</div>}<div className="form-inline"><label className="check"><input name="remember" type="checkbox" /> Manter conectado</label></div><button className="primary-button wide" type="submit" disabled={busy}>{busy ? "Entrando..." : "Entrar na dashboard"}</button></form><a className="back-site" href="/">← Voltar para o site</a></section></main>;
}
