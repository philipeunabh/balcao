"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { LiveMessageRecord } from "../db/live";

function getSenderKey() {
  const storageKey = "balcao-live-chat-key";
  const saved = sessionStorage.getItem(storageKey);
  if (saved) return saved;
  const value = crypto.randomUUID();
  sessionStorage.setItem(storageKey, value);
  return value;
}

export function LiveChat({ sessionId, ownerMode = false, ownerName = "Lojista" }: { sessionId: string; ownerMode?: boolean; ownerName?: string }) {
  const [messages, setMessages] = useState<LiveMessageRecord[]>([]);
  const [name, setName] = useState(ownerMode ? ownerName : "");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const senderKey = useRef("");
  const lastId = useRef(0);
  const feed = useRef<HTMLDivElement>(null);

  useEffect(() => {
    senderKey.current = getSenderKey();
    if (!ownerMode) window.setTimeout(() => setName(localStorage.getItem("balcao-live-chat-name") || ""), 0);
    let active = true;
    async function refresh() {
      try {
        const response = await fetch(`/api/live/${encodeURIComponent(sessionId)}/messages?after=${lastId.current}`, { cache: "no-store" });
        const data = await response.json() as { messages?: LiveMessageRecord[] };
        if (!active || !response.ok || !data.messages?.length) return;
        lastId.current = data.messages.at(-1)?.id || lastId.current;
        setMessages((current) => [...current, ...data.messages!].slice(-100));
        requestAnimationFrame(() => feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: "smooth" }));
      } catch { /* a próxima consulta tenta novamente */ }
    }
    void refresh();
    const timer = window.setInterval(refresh, 1500);
    return () => { active = false; window.clearInterval(timer); };
  }, [ownerMode, sessionId]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const message = String(data.get("message") || "").trim();
    const senderName = ownerMode ? ownerName : name.trim();
    if (!senderName) return setNotice("Informe seu nome para participar.");
    if (!message) return;
    setBusy(true); setNotice("");
    if (!ownerMode) localStorage.setItem("balcao-live-chat-name", senderName);
    try {
      const response = await fetch(`/api/live/${encodeURIComponent(sessionId)}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderKey: senderKey.current, senderName, message }),
      });
      const result = await response.json() as { message?: LiveMessageRecord; error?: string };
      if (!response.ok) return setNotice(result.error || "Não foi possível enviar.");
      if (result.message) {
        lastId.current = Math.max(lastId.current, result.message.id);
        setMessages((current) => [...current, result.message!]);
      }
      form.reset();
    } catch { setNotice("Conexão indisponível. Tente novamente."); }
    finally { setBusy(false); }
  }

  return <section className="live-chat" aria-label="Chat da transmissão">
    <header><div><span className="live-dot" aria-hidden="true" /><strong>Chat ao vivo</strong></div><small>{messages.length} mensagem(ns)</small></header>
    <div className="live-chat-feed" ref={feed} aria-live="polite">
      {messages.length ? messages.map((item) => <article className={item.senderRole} key={item.id}>
        <header><strong>{item.senderName}</strong>{item.senderRole === "store" ? <span>Lojista</span> : null}<time>{new Date(item.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time></header>
        <p>{item.message}</p>
      </article>) : <div className="live-chat-empty"><span>◌</span><p>Envie a primeira pergunta ao anunciante.</p></div>}
    </div>
    <form onSubmit={sendMessage}>
      {!ownerMode ? <label><span>Seu nome</span><input value={name} onChange={(event) => setName(event.target.value.slice(0, 50))} placeholder="Como quer ser chamado?" maxLength={50} required /></label> : null}
      <div><input name="message" placeholder="Digite sua mensagem..." maxLength={500} autoComplete="off" required /><button type="submit" disabled={busy}>{busy ? "…" : "Enviar"}</button></div>
      {notice ? <small role="alert">{notice}</small> : null}
    </form>
  </section>;
}
