"use client";

import { lazy, Suspense, useEffect, useState } from "react";

const AiChatWidget = lazy(() => import("./ai-chat-widget"));
const NewsletterExperience = lazy(() => import("./newsletter-experience"));

const whatsappUrl = "https://wa.me/553133309600?text=Ol%C3%A1%2C%20acessei%20o%20Portal%20Balc%C3%A3o%20e%20preciso%20de%20atendimento.";

function ContactLaunchers({ loading = false, onOpen }: { loading?: boolean; onOpen: () => void }) {
  return (
    <div className="floating-contact-tools">
      <button className="ai-contact-button" type="button" onClick={onOpen} disabled={loading} aria-label="Abrir atendimento com inteligência artificial">
        <span aria-hidden="true">✦</span><b>{loading ? "Carregando…" : "Atendimento IA"}</b>
      </button>
      <a className="whatsapp-contact-button" href={whatsappUrl} target="_blank" rel="noopener noreferrer" aria-label="Falar com o Portal Balcão pelo WhatsApp">
        <span aria-hidden="true">☎</span><b>WhatsApp</b>
      </a>
    </div>
  );
}

export default function DeferredGlobalExperience() {
  const [publicPage, setPublicPage] = useState(false);
  const [newsletterReady, setNewsletterReady] = useState(false);
  const [chatReady, setChatReady] = useState(false);

  useEffect(() => {
    const enabled = !/^\/(admin|comercial|lojista)(?:\/|$)/.test(window.location.pathname);
    queueMicrotask(() => setPublicPage(enabled));
    if (!enabled) return;

    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    let fallback: number | undefined;
    const idleId = idleWindow.requestIdleCallback
      ? idleWindow.requestIdleCallback(() => setNewsletterReady(true), { timeout: 2500 })
      : (fallback = window.setTimeout(() => setNewsletterReady(true), 1200));

    return () => {
      if (idleWindow.cancelIdleCallback && idleId !== undefined) idleWindow.cancelIdleCallback(idleId);
      if (fallback !== undefined) window.clearTimeout(fallback);
    };
  }, []);

  if (!publicPage) return null;
  return (
    <>
      {newsletterReady ? <Suspense fallback={null}><NewsletterExperience /></Suspense> : null}
      {chatReady
        ? <Suspense fallback={<ContactLaunchers loading onOpen={() => undefined} />}><AiChatWidget initialOpen /></Suspense>
        : <ContactLaunchers onOpen={() => setChatReady(true)} />}
    </>
  );
}
