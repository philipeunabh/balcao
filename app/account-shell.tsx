"use client";
/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-img-element */

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { CustomerRecord } from "../db/customer-auth";
import type { SupportTicket } from "../db/customer-account";
import type { ChatConversationSummary, ChatMessage, ListingContactAnalytics } from "../db/contact-chat";
import type { StoredListing } from "../db/listings";
import type { PaymentRecord } from "../db/payments";
import type { InvoiceRecord } from "../db/invoices";
import { createProfilePreview, uploadProfileImage, validateProfileImage } from "./profile-image-client";
import { formatPlanPrice, getFeaturedPlans } from "./featured-plans";
import { encryptPagBankCard, PagBankCardFields } from "./pagbank-card";
import { AiListingImporter } from "./ai-listing-importer";
import { LiveSellerStudio } from "./live-seller-studio";

type AccountSection =
  | "painel"
  | "anuncios"
  | "importador-ia"
  | "mensagens"
  | "favoritos"
  | "planos"
  | "loja"
  | "ao-vivo"
  | "pagamentos"
  | "faturas"
  | "relatorios"
  | "configuracoes"
  | "avaliacoes"
  | "cupons"
  | "ajuda";

type AccountShellProps = {
  customer: CustomerRecord;
  section: AccountSection;
  tickets: SupportTicket[];
  listings: StoredListing[];
  payments: PaymentRecord[];
  invoices: InvoiceRecord[];
  contactAnalytics: ListingContactAnalytics[];
  unreadMessages: number;
  importerScope?: "user" | "store";
  liveEnabled?: boolean;
};

const menuItems: Array<{ section: AccountSection; label: string; icon: string }> = [
  { section: "painel", label: "Painel", icon: "⌂" },
  { section: "anuncios", label: "Anúncios", icon: "▣" },
  { section: "importador-ia", label: "Importador IA", icon: "✦" },
  { section: "mensagens", label: "Mensagens", icon: "▢" },
  { section: "favoritos", label: "Favoritos", icon: "♡" },
  { section: "planos", label: "Planos", icon: "◇" },
  { section: "loja", label: "Loja virtual", icon: "▦" },
  { section: "ao-vivo", label: "Anúncio ao vivo", icon: "●" },
  { section: "pagamentos", label: "Meus Pagamentos", icon: "R$" },
  { section: "faturas", label: "Faturas", icon: "▤" },
  { section: "relatorios", label: "Relatórios", icon: "▥" },
  { section: "configuracoes", label: "Configurações", icon: "⚙" },
  { section: "avaliacoes", label: "Avaliações", icon: "☆" },
  { section: "cupons", label: "Cupons", icon: "▤" },
  { section: "ajuda", label: "Ajuda", icon: "?" },
];

const sectionTitles: Record<AccountSection, string> = {
  painel: "Painel",
  anuncios: "Meus anúncios",
  "importador-ia": "Importador IA",
  mensagens: "Mensagens",
  favoritos: "Favoritos",
  planos: "Planos",
  loja: "Minha loja virtual",
  "ao-vivo": "Anúncio ao vivo",
  pagamentos: "Meus Pagamentos",
  faturas: "Faturas",
  relatorios: "Relatórios",
  configuracoes: "Configurações da conta",
  avaliacoes: "Avaliações",
  cupons: "Cupons",
  ajuda: "Central de ajuda",
};

function accountHref(section: AccountSection) {
  return section === "painel" ? "/minha-conta" : `/minha-conta/${section}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR");
}

function accountDigits(value: string) { return value.replace(/\D/g, ""); }
function maskAccountCpf(value: string) {
  return accountDigits(value).slice(0, 11).replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}
function maskAccountCnpj(value: string) {
  return accountDigits(value).slice(0, 14).replace(/(\d{2})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1/$2").replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}
function maskAccountPhone(value: string) {
  const number = accountDigits(value).slice(0, 11);
  if (number.length <= 10) return number.replace(/(\d{2})(\d{0,4})(\d{0,4})/, (_, ddd, first, last) => `(${ddd}${ddd.length === 2 ? ") " : ""}${first}${last ? `-${last}` : ""}`);
  return number.replace(/(\d{2})(\d{0,5})(\d{0,4})/, (_, ddd, first, last) => `(${ddd}) ${first}${last ? `-${last}` : ""}`);
}

function EmptyAccountState({ icon, title, text, action }: { icon: string; title: string; text: string; action?: React.ReactNode }) {
  return <div className="account-empty"><span aria-hidden="true">{icon}</span><h3>{title}</h3><p>{text}</p>{action}</div>;
}

export function AccountShell({ customer: initialCustomer, section, tickets: initialTickets, listings, payments, invoices, contactAnalytics, unreadMessages, importerScope = "user", liveEnabled = false }: AccountShellProps) {
  const [customer, setCustomer] = useState(initialCustomer);
  const [tickets, setTickets] = useState(initialTickets);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const remaining = Math.max(0, customer.adLimit - customer.activeAds);
  const initials = customer.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const usage = customer.adLimit ? Math.min(100, (customer.activeAds / customer.adLimit) * 100) : 0;

  async function saveProfile(input: { name: string; whatsapp: string; profileImageUrl: string }) {
    const response = await fetch("/api/customer/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const result = await response.json();
    if (!response.ok) {
      setNotice(result.error || "Não foi possível salvar os dados.");
      return false;
    }
    setCustomer(result.customer);
    setNotice("Dados atualizados com sucesso.");
    return true;
  }

  async function openTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const response = await fetch("/api/customer/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ticket", subject: data.get("subject"), message: data.get("message") }),
    });
    const result = await response.json();
    if (!response.ok) return setNotice(result.error || "Não foi possível abrir o chamado.");
    setTickets((current) => [result.ticket, ...current]);
    form.reset();
    setNotice("Chamado aberto com sucesso.");
  }

  return (
    <main className="customer-dashboard">
      <aside className={`customer-sidebar ${menuOpen ? "open" : ""}`}>
        <a className="customer-dashboard-logo" href="/" aria-label="Voltar ao Balcão">
          <img src="/logo-balcao.webp" alt="Balcão" width="172" height="44" />
        </a>
        <nav aria-label="Menu da conta">
          {menuItems.filter((item) => item.section !== "ao-vivo" || liveEnabled).map((item) => <a className={item.section === section ? "active" : ""} href={item.section === "importador-ia" && importerScope === "store" ? "/lojista/importador-ia" : accountHref(item.section)} key={item.section} onClick={() => setMenuOpen(false)}><i aria-hidden="true">{item.icon}</i><span>{item.label}</span></a>)}
          <a href="/api/customer/logout"><i aria-hidden="true">↪</i><span>Sair</span></a>
        </nav>
        <section className="customer-help-card">
          <strong><span aria-hidden="true">◉</span> Precisa de ajuda?</strong>
          <p>Envie sua solicitação para nossa equipe.</p>
          <a href="/minha-conta/ajuda">Abrir chamado</a>
        </section>
      </aside>

      <section className="customer-dashboard-main">
        <header className="customer-dashboard-topbar">
          <button className="customer-menu-toggle" type="button" onClick={() => setMenuOpen((open) => !open)} aria-label="Abrir menu" aria-expanded={menuOpen}>☰</button>
          <div className="customer-top-actions">
            <a className="customer-notification" href="/minha-conta/mensagens" aria-label="Mensagens e notificações">♧</a>
            <a className="customer-profile-summary" href="/minha-conta/configuracoes">{customer.profileImageUrl ? <img className="customer-avatar" src={customer.profileImageUrl} alt={`Foto de ${customer.name}`} /> : <span className="customer-avatar">{initials}</span>}<span><small>Olá,</small><strong>{customer.name}</strong><em>{customer.accountType === "empresa" ? "Empresa" : "Particular"}</em></span><b aria-hidden="true">⌄</b></a>
          </div>
        </header>
        <div className="customer-dashboard-content">
          {notice ? <div className="customer-dashboard-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Fechar aviso">×</button></div> : null}
          {section === "painel" ? <DashboardOverview customer={customer} remaining={remaining} usage={usage} tickets={tickets} listings={listings} contactAnalytics={contactAnalytics} unreadMessages={unreadMessages} /> : null}
          {section === "anuncios" ? <ListingsSection listings={listings} remaining={remaining} contactAnalytics={contactAnalytics} unreadMessages={unreadMessages} onNotice={setNotice} /> : null}
          {section === "importador-ia" ? <><SectionHeader section="importador-ia" description={importerScope === "store" ? "Importe produtos para a loja virtual e revise tudo antes de publicar." : "Crie anúncios completos a partir de links públicos e revise tudo antes de publicar."} /><AiListingImporter scope={importerScope} /></> : null}
          {section === "mensagens" ? <MessagesSection customerId={customer.id} /> : null}
          {section === "favoritos" ? <FavoritesSection /> : null}
          {section === "planos" ? <PlansSection customer={customer} remaining={remaining} usage={usage} /> : null}
          {section === "loja" ? <StoreSection customer={customer} onNotice={setNotice} onPlanSaved={(plan) => setCustomer((current) => ({ ...current, planCode: plan.code, planName: plan.name, adLimit: plan.adLimit }))} /> : null}
          {section === "ao-vivo" && liveEnabled ? <LiveSellerStudio storeName={customer.name} /> : null}
          {section === "pagamentos" ? <PaymentsSection payments={payments} /> : null}
          {section === "faturas" ? <InvoicesSection invoices={invoices} /> : null}
          {section === "relatorios" ? <ReportsSection payments={payments} contactAnalytics={contactAnalytics} /> : null}
          {section === "configuracoes" ? <SettingsSection customer={customer} saveProfile={saveProfile} /> : null}
          {section === "avaliacoes" ? <ReviewsSection /> : null}
          {section === "cupons" ? <CouponsSection /> : null}
          {section === "ajuda" ? <HelpSection tickets={tickets} openTicket={openTicket} /> : null}
          <footer className="customer-dashboard-footer"><span>© {new Date().getFullYear()} Balcão. Todos os direitos reservados.</span><a href="/">Voltar ao site</a></footer>
        </div>
      </section>
      {menuOpen ? <button className="customer-sidebar-backdrop" type="button" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} /> : null}
    </main>
  );
}

function SectionHeader({ section, description, action }: { section: AccountSection; description: string; action?: React.ReactNode }) {
  return <div className="customer-page-heading"><div><span>Minha conta</span><h1>{sectionTitles[section]}</h1><p>{description}</p></div>{action}</div>;
}

function DashboardOverview({ customer, remaining, usage, tickets, listings, contactAnalytics, unreadMessages }: { customer: CustomerRecord; remaining: number; usage: number; tickets: SupportTicket[]; listings: StoredListing[]; contactAnalytics: ListingContactAnalytics[]; unreadMessages: number }) {
  const firstName = customer.name.split(/\s+/)[0];
  const totalContacts = contactAnalytics.reduce((total, item) => total + item.phoneUsers + item.phoneVisitors + item.whatsappUsers + item.whatsappVisitors, 0);
  return <>
    <SectionHeader section="painel" description="Acompanhe sua conta e gerencie seus anúncios." action={<a className="customer-period" href="/minha-conta/relatorios">Últimos 30 dias⌄</a>} />
    <div className="customer-metric-grid">
      <article className="red"><i>▣</i><span>Anúncios ativos<strong>{customer.activeAds}</strong><small>publicados</small></span></article>
      <article className="blue"><i>＋</i><span>Anúncios disponíveis<strong>{remaining}</strong><small>do seu plano</small></span></article>
      <article className="green"><i>▢</i><span>Mensagens<strong>{unreadMessages}</strong><small>não lidas</small></span></article>
      <article className="orange"><i>↗</i><span>Contatos<strong>{totalContacts}</strong><small>telefone e WhatsApp</small></span></article>
      <article className="purple"><i>☆</i><span>Plano atual<strong>{customer.adLimit}</strong><small>anúncios incluídos</small></span></article>
    </div>
    <div className="customer-dashboard-grid">
      <section className="customer-panel customer-performance">
        <header><div><h2>Desempenho dos anúncios</h2><p>Últimos 30 dias</p></div><a href="/minha-conta/relatorios">Ver relatório</a></header>
        {contactAnalytics.length === 0 ? <EmptyAccountState icon="↗" title="Sem contatos registrados" text="Os cliques para revelar telefone e abrir o WhatsApp aparecerão aqui." action={customer.activeAds === 0 ? <a className="customer-primary-action" href="/anunciar">Criar anúncio</a> : undefined} /> : <div className="customer-contact-summary">{contactAnalytics.slice(0, 4).map((item) => <article key={item.listingId}><span><strong>{item.title}</strong><small>{item.phoneUsers + item.phoneVisitors} telefone · {item.whatsappUsers + item.whatsappVisitors} WhatsApp</small></span><b>{item.phoneUsers + item.phoneVisitors + item.whatsappUsers + item.whatsappVisitors}</b></article>)}</div>}
      </section>
      <aside className="customer-panel customer-activity"><header><h2>Atividades recentes</h2></header><article><i>✓</i><span><strong>Conta verificada</strong><small>{formatDate(customer.createdAt)}</small></span></article>{tickets.slice(0, 3).map((ticket) => <article key={ticket.id}><i>?</i><span><strong>Chamado #{ticket.id}</strong><small>{ticket.subject}</small></span></article>)}<a href="/minha-conta/ajuda">Ver todos os chamados</a></aside>
      <section className="customer-panel customer-listings-summary"><header><div><h2>Meus anúncios</h2><p>{listings.length} anúncio(s) salvo(s)</p></div><a href="/minha-conta/anuncios">Ver todos</a></header>{listings.length === 0 ? <EmptyAccountState icon="▣" title={`Olá, ${firstName}. Publique seu primeiro anúncio`} text={`Seu plano permite até ${customer.adLimit} anúncios gratuitos.`} action={<a className="customer-primary-action" href="/anunciar">Anunciar grátis</a>} /> : <div className="customer-count-summary"><strong>{listings.length}</strong><span>anúncio(s) vinculado(s) à sua conta</span></div>}</section>
      <aside className="customer-panel customer-plan-summary"><header><h2>Resumo do plano</h2></header><span>Plano atual</span><strong>{customer.planName}</strong><div className="customer-progress"><i style={{ width: `${usage}%` }} /></div><p>{customer.activeAds} de {customer.adLimit} anúncios utilizados</p><dl><div><dt>Disponíveis</dt><dd>{remaining}</dd></div><div><dt>Status</dt><dd>Ativo</dd></div></dl><a href="/minha-conta/planos">Gerenciar plano</a></aside>
    </div>
  </>;
}

function ListingsSection({ listings, remaining, contactAnalytics, unreadMessages, onNotice }: { listings: StoredListing[]; remaining: number; contactAnalytics: ListingContactAnalytics[]; unreadMessages: number; onNotice: (message: string) => void }) {
  const [records, setRecords] = useState(listings);
  const [filter, setFilter] = useState("Todos");
  const [highlight, setHighlight] = useState<StoredListing | null>(null);
  const [highlightPlan, setHighlightPlan] = useState<"monthly" | "super">("monthly");
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "card">("pix");
  const [paymentOptions, setPaymentOptions] = useState({ pix: true, card: true });
  const [savedCards, setSavedCards] = useState<Array<{ id: string; brand: string | null; last4: string; holderName: string }>>([]);
  const [cardSource, setCardSource] = useState<"saved" | "new">("new");
  const [savedCardId, setSavedCardId] = useState(""); const [securityCode, setSecurityCode] = useState("");
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentResult, setPaymentResult] = useState<{ qrCodeText?: string; qrCodeImage?: string; message: string } | null>(null);
  const active = records.filter((item) => item.status === "active"); const pending = records.filter((item) => ["pending_review", "awaiting_payment"].includes(item.status));
  const filtered = records.filter((item) => filter === "Todos" || filter === "Ativos" && item.status === "active" || filter === "Pendentes" && ["pending_review", "awaiting_payment"].includes(item.status) || filter === "Encerrados" && ["closed", "expired", "rejected"].includes(item.status));
  const statusLabel = (item: StoredListing) => item.status === "active" ? "Publicado" : item.status === "awaiting_payment" ? "Aguardando pagamento" : item.status === "pending_review" ? "Pendente de aprovação" : item.status === "rejected" ? "Recusado" : "Encerrado";
  const metrics = (id: string) => contactAnalytics.find((item) => item.listingId === id);
  const monthlyPrice = highlight ? getFeaturedPlans(highlight.category).find((plan) => plan.code === "monthly")?.amountCents || 4900 : 4900;

  useEffect(() => {
    if (!highlight || paymentMethod !== "card") return;
    fetch("/api/customer/saved-cards", { cache: "no-store" }).then((response) => response.json()).then((data) => { const cards = Array.isArray(data.cards) ? data.cards : []; setSavedCards(cards); setSavedCardId(cards[0]?.id || ""); setCardSource(cards.length ? "saved" : "new"); }).catch(() => { setSavedCards([]); setCardSource("new"); });
  }, [highlight, paymentMethod]);

  useEffect(() => {
    fetch("/api/settings").then((response) => response.json()).then((data) => { const options = { pix: data.pagbank_pix_enabled !== false, card: data.pagbank_card_enabled !== false }; setPaymentOptions(options); if (!options.pix && options.card) setPaymentMethod("card"); }).catch(() => undefined);
  }, []);

  async function removeListing(item: StoredListing) {
    if (!window.confirm(`Excluir definitivamente o anúncio “${item.title}”?`)) return;
    const response = await fetch(`/api/customer/listings/${encodeURIComponent(item.id)}`, { method: "DELETE" });
    if (!response.ok) return onNotice("Não foi possível excluir o anúncio.");
    setRecords((current) => current.filter((record) => record.id !== item.id)); onNotice("Anúncio excluído.");
  }

  async function startHighlightPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!highlight) return; setPaymentBusy(true); setPaymentResult(null);
    try {
    const card = paymentMethod === "card" && cardSource === "new" ? await encryptPagBankCard(new FormData(event.currentTarget)) : {};
    const response = await fetch(`/api/customer/listings/${encodeURIComponent(highlight.id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "highlight", plan: highlightPlan, method: paymentMethod, savedCardId: cardSource === "saved" ? savedCardId : undefined, securityCode: cardSource === "saved" ? securityCode : undefined, ...card }) });
    const data = await response.json() as { error?: string; qrCodeText?: string; qrCodeImage?: string; paid?: boolean };
    if (!response.ok) setPaymentResult({ message: data.error || "Não foi possível iniciar o pagamento." });
    else {
      setRecords((current) => current.map((item) => item.id === highlight.id ? { ...item, publicationType: "featured", featuredPlan: highlightPlan, status: data.paid ? "pending_review" : "awaiting_payment" } : item));
      setPaymentResult({ qrCodeText: data.qrCodeText, qrCodeImage: data.qrCodeImage, message: data.paid ? "Pagamento aprovado. O anúncio foi enviado para revisão." : paymentMethod === "pix" ? "Pix gerado. Conclua o pagamento para ativar o destaque." : "Pagamento enviado ao PagBank." });
    }
    } catch (cause) { setPaymentResult({ message: cause instanceof Error ? cause.message : "Não foi possível iniciar o pagamento." }); }
    setPaymentBusy(false);
  }

  return <><SectionHeader section="anuncios" description={`Gerencie publicações, desempenho e destaque. ${unreadMessages} mensagem(ns) não lida(s).`} action={<a className="customer-primary-action" href="/anunciar">＋ Criar anúncio</a>} />
    <div className="customer-metric-grid compact"><article className="red"><i>▣</i><span>Ativos<strong>{active.length}</strong></span></article><article className="blue"><i>＋</i><span>Disponíveis<strong>{remaining}</strong></span></article><article className="orange"><i>◷</i><span>Pendentes<strong>{pending.length}</strong></span></article></div>
    <section className="customer-panel customer-section-panel"><div className="customer-tabs">{["Todos", "Ativos", "Pendentes", "Encerrados"].map((item) => <button className={filter === item ? "active" : ""} type="button" onClick={() => setFilter(item)} key={item}>{item}</button>)}</div>
      {filtered.length ? <div className="customer-listing-records detailed">{filtered.map((item) => { const analytic = metrics(item.id); const views = (analytic?.viewUsers || 0) + (analytic?.viewVisitors || 0); const phone = (analytic?.phoneUsers || 0) + (analytic?.phoneVisitors || 0); const whatsapp = (analytic?.whatsappUsers || 0) + (analytic?.whatsappVisitors || 0); return <article key={item.id}><img src={item.coverImage || "/favicon.svg"} alt="" /><div className="customer-listing-main"><strong>{item.title}</strong><span>{item.category} · {item.subcategory}</span><small>Publicado em {formatDate(item.createdAt)} · até {item.expiresAt ? formatDate(item.expiresAt) : "sem prazo definido"}</small><small>{item.publicationType === "featured" ? `Destaque ${item.featuredPlan || "mensal"}` : "Anúncio grátis"}</small></div><div className="customer-listing-metrics"><span><b>{views}</b> views</span><span><b>{phone + whatsapp}</b> cliques</span><span><b>{phone}</b> telefone</span><span><b>{whatsapp}</b> WhatsApp</span></div><b className={`listing-owner-status ${item.status}`}>{statusLabel(item)}</b><div className="customer-listing-actions"><a href={`/anuncio/${encodeURIComponent(item.id)}`}>Ver</a><a href={`/editar-anuncio/${encodeURIComponent(item.id)}`}>Editar</a><button type="button" onClick={() => { setHighlight(item); setPaymentResult(null); }}>Destacar</button><button className="danger" type="button" onClick={() => void removeListing(item)}>Excluir</button></div></article>; })}</div> : <EmptyAccountState icon="▣" title={filter === "Todos" ? "Nenhum anúncio salvo" : `Nenhum anúncio ${filter.toLowerCase()}`} text={filter === "Todos" ? `Você ainda pode publicar ${remaining} anúncio(s) no seu plano atual.` : `Não existem anúncios na situação “${filter}”.`} action={filter === "Todos" ? <a className="customer-primary-action" href="/anunciar">Publicar anúncio</a> : null} />}
      {filtered.length ? <div className="customer-invoice-links"><strong>Faturas dos anúncios</strong>{filtered.map((item) => <a href={`/api/customer/invoices/${encodeURIComponent(item.id)}`} key={item.id}>Baixar PDF · {item.title}</a>)}</div> : null}
    </section>
    {highlight ? <div className="account-highlight-modal" role="dialog" aria-modal="true"><form onSubmit={(event) => void startHighlightPayment(event)}><header><div><span>Promover anúncio</span><h2>{highlight.title}</h2></div><button type="button" onClick={() => setHighlight(null)}>×</button></header><div className="highlight-plan-options"><label className={highlightPlan === "monthly" ? "selected" : ""}><input type="radio" checked={highlightPlan === "monthly"} onChange={() => setHighlightPlan("monthly")} /><span>Destaque mensal</span><strong>{formatPlanPrice(monthlyPrice)}</strong><small>Preço definido para {highlight.category}</small></label><label className={highlightPlan === "super" ? "selected" : ""}><input type="radio" checked={highlightPlan === "super"} onChange={() => setHighlightPlan("super")} /><span>Super destaque</span><strong>R$ 99,00</strong><small>Prioridade máxima e presença na home</small></label></div><div className="highlight-payment-method">{paymentOptions.pix ? <label><input type="radio" checked={paymentMethod === "pix"} onChange={() => setPaymentMethod("pix")} /> Pix com QR Code</label> : null}{paymentOptions.card ? <label><input type="radio" checked={paymentMethod === "card"} onChange={() => setPaymentMethod("card")} /> Cartão de crédito</label> : null}</div>{paymentMethod === "card" ? <>{savedCards.length ? <div className="card-source-options"><label><input type="radio" checked={cardSource === "saved"} onChange={() => setCardSource("saved")} />Usar cartão salvo</label><label><input type="radio" checked={cardSource === "new"} onChange={() => setCardSource("new")} />Usar novo cartão</label></div> : null}{cardSource === "saved" && savedCards.length ? <div className="saved-card-payment"><label>Cartão<select value={savedCardId} onChange={(event) => setSavedCardId(event.target.value)}>{savedCards.map((card) => <option value={card.id} key={card.id}>{card.brand?.toUpperCase() || "Cartão"} final {card.last4}</option>)}</select></label><label>CVV<input type="password" inputMode="numeric" maxLength={4} required value={securityCode} onChange={(event) => setSecurityCode(event.target.value.replace(/\D/g, ""))} /></label></div> : <PagBankCardFields />}</> : <p className="payment-security-note">O QR Code e o código Pix Copia e Cola serão gerados pelo PagBank.</p>}{paymentResult ? <div className="highlight-payment-result"><p>{paymentResult.message}</p>{paymentResult.qrCodeImage ? <img src={paymentResult.qrCodeImage} alt="QR Code Pix" /> : null}{paymentResult.qrCodeText ? <textarea value={paymentResult.qrCodeText} readOnly /> : null}</div> : null}<footer><button type="button" className="customer-secondary-action" onClick={() => setHighlight(null)}>Fechar</button><button type="submit" className="customer-primary-action" disabled={paymentBusy || !paymentOptions.pix && !paymentOptions.card || paymentMethod === "card" && cardSource === "saved" && (!savedCardId || securityCode.length < 3)}>{paymentBusy ? "Processando…" : paymentMethod === "pix" ? "Gerar QR Code Pix" : "Pagar com cartão"}</button></footer></form></div> : null}
  </>;
}

function MessagesSection({ customerId }: { customerId: number }) {
  const [conversations, setConversations] = useState<ChatConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("conversation") || "");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState("");
  const activeConversation = useMemo(() => conversations.find((item) => item.id === selectedId) || null, [conversations, selectedId]);

  useEffect(() => {
    let active = true;
    fetch("/api/chat/conversations", { cache: "no-store" }).then(async (response) => {
      const payload = await response.json().catch(() => ({})) as { conversations?: ChatConversationSummary[]; error?: string };
      if (!active) return;
      if (!response.ok) { setChatError(payload.error || "Não foi possível carregar as conversas."); setLoading(false); return; }
      const next = Array.isArray(payload.conversations) ? payload.conversations : [];
      setConversations(next);
      setSelectedId((current) => next.some((item) => item.id === current) ? current : next[0]?.id || "");
      setLoading(false);
    }).catch(() => { if (active) { setChatError("Não foi possível carregar as conversas."); setLoading(false); } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    const loadMessages = async () => {
      const response = await fetch(`/api/chat/conversations/${encodeURIComponent(selectedId)}/messages`, { cache: "no-store" }).catch(() => null);
      const payload = response ? await response.json().catch(() => ({})) as { messages?: ChatMessage[]; error?: string } : {};
      if (!active) return;
      if (response?.ok) { setMessages(Array.isArray(payload.messages) ? payload.messages : []); setChatError(""); }
      else setChatError(payload.error || "Não foi possível atualizar a conversa.");
    };
    void loadMessages();
    const interval = window.setInterval(loadMessages, 8_000);
    return () => { active = false; window.clearInterval(interval); };
  }, [selectedId]);

  const chooseConversation = (id: string) => {
    setSelectedId(id); setMessages([]); setChatError("");
    const url = new URL(window.location.href); url.searchParams.set("conversation", id); window.history.replaceState({}, "", url);
  };

  const submitMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedId || sending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const message = String(data.get("message") || "").trim();
    if (!message) return;
    setSending(true); setChatError("");
    const response = await fetch(`/api/chat/conversations/${encodeURIComponent(selectedId)}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) }).catch(() => null);
    const payload = response ? await response.json().catch(() => ({})) as { message?: ChatMessage; error?: string } : {};
    if (response?.ok && payload.message) {
      setMessages((current) => [...current, { ...payload.message!, senderName: "Você" }]); form.reset();
      setConversations((current) => current.map((item) => item.id === selectedId ? { ...item, lastMessage: message, lastMessageAt: payload.message!.createdAt } : item));
    } else setChatError(payload.error || "Não foi possível enviar a mensagem.");
    setSending(false);
  };

  return <><SectionHeader section="mensagens" description="Converse com interessados e anunciantes, com histórico salvo na sua conta." /><section className="customer-panel customer-chat-panel">
    {loading ? <div className="customer-chat-loading">Carregando conversas…</div> : conversations.length === 0 ? <EmptyAccountState icon="▢" title="Nenhuma conversa" text="Use o botão “Conversar no chat” no detalhe de um anúncio para iniciar uma conversa." /> : <div className="customer-chat-layout">
      <aside className="customer-chat-list" aria-label="Conversas">{conversations.map((conversation) => <button className={conversation.id === selectedId ? "active" : ""} type="button" onClick={() => chooseConversation(conversation.id)} key={conversation.id}><span className="customer-chat-avatar">{conversation.otherPartyAvatar ? <img src={conversation.otherPartyAvatar} alt="" /> : conversation.otherPartyName.charAt(0).toUpperCase()}</span><span><strong>{conversation.otherPartyName}</strong><b>{conversation.listingTitle}</b><small>{conversation.lastMessage || "Conversa iniciada. Envie a primeira mensagem."}</small></span>{conversation.unreadCount ? <em>{conversation.unreadCount}</em> : null}</button>)}</aside>
      <div className="customer-chat-conversation">{activeConversation ? <><header><div><strong>{activeConversation.otherPartyName}</strong><span>{activeConversation.listingTitle}</span></div><a href={`/anuncio/${encodeURIComponent(activeConversation.listingId)}`}>Ver anúncio</a></header><div className="customer-chat-messages" aria-live="polite">{messages.length ? messages.map((message) => <article className={message.senderUserId === customerId ? "own" : ""} key={message.id}><small>{message.senderUserId === customerId ? "Você" : message.senderName}</small><p>{message.body}</p><time>{new Date(message.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</time></article>) : <div className="customer-chat-start"><strong>Conversa iniciada</strong><span>Digite abaixo para enviar a primeira mensagem.</span></div>}</div><form onSubmit={submitMessage}><textarea name="message" maxLength={2000} placeholder="Digite sua mensagem…" aria-label="Mensagem" required /><button className="customer-primary-action" disabled={sending}>{sending ? "Enviando…" : "Enviar"}</button></form></> : null}</div>
    </div>}
    {chatError ? <p className="customer-chat-error" role="alert">{chatError}</p> : null}
  </section></>;
}

function FavoritesSection() {
  return <><SectionHeader section="favoritos" description="Consulte os anúncios que você marcou para ver depois." action={<a className="customer-secondary-action" href="/favoritos">Abrir favoritos</a>} /><section className="customer-panel customer-section-panel"><EmptyAccountState icon="♡" title="Consulte seus anúncios favoritos" text="A lista completa de anúncios salvos está disponível na página de favoritos." action={<a className="customer-primary-action" href="/favoritos">Ver favoritos</a>} /></section></>;
}

function PlansSection({ customer, remaining, usage }: { customer: CustomerRecord; remaining: number; usage: number }) {
  const unlimited = customer.adLimit >= 999999;
  return <><SectionHeader section="planos" description="Acompanhe o limite e o uso do seu plano." /><section className="customer-panel customer-current-plan"><div><span>Plano atual</span><h2>{customer.planName}</h2><p>{unlimited ? "Anúncios ilimitados." : `Até ${customer.adLimit} anúncios ativos.`}</p><b>Ativo</b></div><div><strong>{unlimited ? "∞" : remaining}</strong><span>anúncios disponíveis</span><div className="customer-progress"><i style={{ width: `${usage}%` }} /></div><small>{customer.activeAds} anúncio(s) utilizado(s)</small></div></section><section className="customer-panel customer-section-panel"><EmptyAccountState icon="▦" title="Transforme sua conta em uma loja virtual" text="Escolha entre 50, 200 ou anúncios ilimitados e publique sua página profissional." action={<a className="customer-primary-action" href="/lojas-virtuais">Ver planos de lojas</a>} /></section></>;
}

type StorePlanClient = { code: "store-free" | "store-pro" | "store-unlimited"; name: string; priceCents: number; adLimit: number };
type StoreFormRecord = { slug: string; name: string; type: "real_estate" | "vehicle" | "general"; logoUrl: string | null; bannerUrl: string | null; primaryColor:string; secondaryColor:string; description: string; planCode: StorePlanClient["code"]; adLimit:number; planStartedAt:string|null; planEndsAt:string|null; active:boolean; integrationType: "manual" | "xml" | "json" | "api" | "wordpress" | "website" | "partner"; feedUrl: string | null; partnerName: string | null; websiteUrl: string | null; email: string; phone:string; whatsapp: string; socialLinks:Record<string,string>; address: string; city: string; state: string };
type StoreListingClient={id:string;title:string;priceCents:number|null;coverImage:string;source:string;createdAt:string};
const clientStorePlans: StorePlanClient[] = [
  { code: "store-free", name: "Loja Essencial", priceCents: 0, adLimit: 50 },
  { code: "store-pro", name: "Loja Profissional", priceCents: 9900, adLimit: 200 },
  { code: "store-unlimited", name: "Loja Ilimitada", priceCents: 24900, adLimit: 999999 },
];

function StoreSection({ customer, onNotice, onPlanSaved }: { customer: CustomerRecord; onNotice: (message: string) => void; onPlanSaved: (plan: StorePlanClient) => void }) {
  const [store, setStore] = useState<StoreFormRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [planCode, setPlanCode] = useState<StorePlanClient["code"]>("store-free");
  const [integrationType, setIntegrationType] = useState<StoreFormRecord["integrationType"]>("manual");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [bannerFile,setBannerFile]=useState<File|null>(null); const [bannerPreview,setBannerPreview]=useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [storeListings,setStoreListings]=useState<StoreListingClient[]>([]); const [planCurrent,setPlanCurrent]=useState(false); const [manualBusy,setManualBusy]=useState(false);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("plano");
    const requestedPlan = clientStorePlans.find((plan) => plan.code === requested)?.code;
    fetch("/api/customer/store").then((response) => response.json()).then((result) => {
      if (result.store) {
        setStore(result.store);
        setPlanCode(requestedPlan || result.store.planCode);
        setIntegrationType(result.store.integrationType || "manual");
        setLogoPreview(result.store.logoUrl || "");
        setBannerPreview(result.store.bannerUrl || "");
        setStoreListings(Array.isArray(result.listings)?result.listings:[]); setPlanCurrent(result.planCurrent===true);
      } else if (requestedPlan) setPlanCode(requestedPlan);
    }).catch(() => onNotice("Não foi possível carregar a configuração da loja.")).finally(() => setLoading(false));
  }, [onNotice]);

  function selectLogo(file?: File) {
    if (!file) return;
    const error = validateProfileImage(file);
    if (error) return onNotice(error);
    if (logoPreview.startsWith("blob:")) URL.revokeObjectURL(logoPreview);
    setLogoFile(file);
    setLogoPreview(createProfilePreview(file));
  }

  function selectBanner(file?:File){if(!file)return;const error=validateProfileImage(file);if(error)return onNotice(error);if(bannerPreview.startsWith("blob:"))URL.revokeObjectURL(bannerPreview);setBannerFile(file);setBannerPreview(createProfilePreview(file));}

  async function saveStore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      let logoUrl = store?.logoUrl || "";
      if (logoFile) logoUrl = await uploadProfileImage(logoFile);
      let bannerUrl=store?.bannerUrl||""; if(bannerFile) bannerUrl=await uploadProfileImage(bannerFile);
      const data = new FormData(event.currentTarget);
      const payload = { name: data.get("name"), slug: data.get("slug"), type: data.get("type"), logoUrl,bannerUrl,primaryColor:data.get("primaryColor"),secondaryColor:data.get("secondaryColor"), description: data.get("description"), integrationType, feedUrl: data.get("feedUrl"), partnerName: data.get("partnerName"), websiteUrl: data.get("websiteUrl"), email: data.get("email"),phone:data.get("phone"), whatsapp: data.get("whatsapp"),socialLinks:{instagram:data.get("instagram"),facebook:data.get("facebook"),youtube:data.get("youtube"),tiktok:data.get("tiktok"),linkedin:data.get("linkedin")}, address: data.get("address"), city: data.get("city"), state: data.get("state") };
      const response = await fetch("/api/customer/store", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) return onNotice(result.error || "Não foi possível salvar a loja.");
      setStore(result.store);
      setLogoFile(null);
      setLogoPreview(result.store.logoUrl || "");
      setBannerFile(null);setBannerPreview(result.store.bannerUrl||"");
      const selectedPlan = clientStorePlans.find((plan) => plan.code === planCode)!;
      onPlanSaved(selectedPlan);
      onNotice("Loja virtual e plano salvos com sucesso.");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Não foi possível salvar a loja.");
    } finally { setSaving(false); }
  }

  async function requestRenewal(){const response=await fetch("/api/customer/store",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({planCode})});const data=await response.json();onNotice(response.ok?data.message:data.error||"Não foi possível solicitar a renovação.");}

  async function createStoreListing(event:FormEvent<HTMLFormElement>){event.preventDefault();setManualBusy(true);try{const form=new FormData(event.currentTarget);const file=form.get("image");if(!(file instanceof File)||!file.size)throw new Error("Selecione uma imagem.");const image=await uploadProfileImage(file);const price=String(form.get("price")||"").replace(/\./g,"").replace(",",".");const response=await fetch("/api/customer/store/listings",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({title:form.get("title"),description:form.get("description"),category:form.get("category"),subcategory:form.get("subcategory"),priceCents:price?Math.round(Number(price)*100):null,address:form.get("address"),externalUrl:form.get("externalUrl"),images:[image]})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Não foi possível publicar.");const refreshed=await fetch("/api/customer/store/listings").then(r=>r.json());setStoreListings(Array.isArray(refreshed.listings)?refreshed.listings:[]);event.currentTarget.reset();onNotice(data.message);}catch(error){onNotice(error instanceof Error?error.message:"Não foi possível publicar.");}finally{setManualBusy(false);}}

  async function importCatalog(sync = false) {
    if (!sync && !importFile) return onNotice("Selecione um arquivo XML ou JSON.");
    setImporting(true);
    try {
      const options: RequestInit = sync ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sync" }) } : (() => { const body = new FormData(); body.set("file", importFile!); return { method: "POST", body }; })();
      const response = await fetch("/api/customer/store/import", options);
      const result = await response.json();
      onNotice(response.ok ? result.message : result.error || "Não foi possível importar o catálogo.");
      if (response.ok) setImportFile(null);
    } catch { onNotice("Não foi possível importar o catálogo."); }
    finally { setImporting(false); }
  }

  if (loading) return <><SectionHeader section="loja" description="Configure sua página profissional, seu plano e as integrações do catálogo." /><section className="customer-panel customer-section-panel"><p>Carregando configuração da loja…</p></section></>;
  const defaultSlug = customer.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const currentPlan=clientStorePlans.find((plan)=>plan.code===(store?.planCode||planCode))||clientStorePlans[0];
  return <>
    <SectionHeader section="loja" description="Gerencie identidade, catálogo, integrações e vigência do seu plano." action={store?.slug?<a className="customer-secondary-action" href={`/loja/${store.slug}`}>Ver loja pública</a>:null}/>
    <section className={`customer-panel retailer-plan-summary ${planCurrent?"active":"expired"}`}><div><span>Plano atual</span><h2>{currentPlan.name}</h2><p>{store?.planStartedAt?`Início: ${formatDate(store.planStartedAt)}`:"Início imediato"} · {store?.planEndsAt?`Vencimento: ${formatDate(store.planEndsAt)}`:"Sem vencimento definido"}</p></div><div><strong>{(store?.adLimit||0)>=999999?"∞":store?.adLimit||currentPlan.adLimit}</strong><span>anúncios permitidos</span><b>{planCurrent?"Plano vigente":"Plano inativo ou vencido"}</b><select aria-label="Plano desejado para renovação" value={planCode} onChange={event=>setPlanCode(event.target.value as StorePlanClient["code"])}>{clientStorePlans.map(plan=><option value={plan.code} key={plan.code}>{plan.name}</option>)}</select><button className="customer-primary-action" type="button" onClick={()=>void requestRenewal()}>Renovar plano</button></div></section>
    <section className="customer-panel customer-settings-card customer-store-settings"><form onSubmit={saveStore}>
      <h2>Identidade visual</h2><div className="retailer-media-grid"><label className="customer-profile-photo">Logo da loja<span>{logoPreview?<img src={logoPreview} alt="Prévia da logo"/>:<i>LOJA</i>}<b>Selecionar logo</b><input type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>selectLogo(event.target.files?.[0])}/></span></label><label className="customer-profile-photo retailer-banner-upload">Banner da loja<span>{bannerPreview?<img src={bannerPreview} alt="Prévia do banner"/>:<i>BANNER</i>}<b>Selecionar banner</b><input type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>selectBanner(event.target.files?.[0])}/></span></label></div>
      <div className="customer-form-grid"><label>Nome da loja<input name="name" defaultValue={store?.name||customer.name} required minLength={3}/></label><label>Tipo de loja<select name="type" defaultValue={store?.type||"general"}><option value="general">Loja virtual</option><option value="real_estate">Imobiliária</option><option value="vehicle">Loja de veículos</option></select></label><label>Cor principal<input name="primaryColor" type="color" defaultValue={store?.primaryColor||"#d71920"}/></label><label>Cor secundária<input name="secondaryColor" type="color" defaultValue={store?.secondaryColor||"#17191e"}/></label><label className="full">URL profissional<span className="professional-url-field"><b>/loja/</b><input name="slug" defaultValue={store?.slug||defaultSlug} required/></span></label><label className="full">Descrição<textarea name="description" defaultValue={store?.description||""} required minLength={20}/></label><label className="full">Link padrão do botão Comprar<input name="websiteUrl" type="url" defaultValue={store?.websiteUrl||""} placeholder="https://sualoja.com.br"/></label></div>
      <h2>Contato, endereço e redes sociais</h2><div className="customer-form-grid"><label>E-mail comercial<input name="email" type="email" defaultValue={store?.email||customer.email} required/></label><label>Telefone<input name="phone" defaultValue={maskAccountPhone(store?.phone||"")}/></label><label>WhatsApp<input name="whatsapp" defaultValue={maskAccountPhone(store?.whatsapp||customer.whatsapp)}/></label><label>Instagram<input name="instagram" type="url" defaultValue={store?.socialLinks?.instagram||""}/></label><label>Facebook<input name="facebook" type="url" defaultValue={store?.socialLinks?.facebook||""}/></label><label>YouTube<input name="youtube" type="url" defaultValue={store?.socialLinks?.youtube||""}/></label><label>TikTok<input name="tiktok" type="url" defaultValue={store?.socialLinks?.tiktok||""}/></label><label>LinkedIn<input name="linkedin" type="url" defaultValue={store?.socialLinks?.linkedin||""}/></label><label className="full">Endereço<input name="address" defaultValue={store?.address||""}/></label><label>Cidade<input name="city" defaultValue={store?.city||""} required/></label><label>UF<input name="state" defaultValue={store?.state||"MG"} maxLength={2} required/></label></div>
      <h2>Integração do catálogo</h2><div className="store-integration-options">{(["manual","xml","json","api","wordpress","website","partner"] as const).map(type=><label className={integrationType===type?"selected":""} key={type}><input type="radio" checked={integrationType===type} onChange={()=>setIntegrationType(type)}/><span>{type==="manual"?"Manual":type==="wordpress"?"WordPress":type==="website"?"Site com IA":type==="api"?"API JSON":type.toUpperCase()}</span></label>)}</div>{integrationType!=="manual"?<div className="customer-form-grid"><label className="full">URL do site, feed ou API<input name="feedUrl" type="url" defaultValue={store?.feedUrl||""} placeholder="https://cliente.com.br/wp-json/..."/></label><label>Plataforma parceira<input name="partnerName" defaultValue={store?.partnerName||""}/></label></div>:<><input type="hidden" name="feedUrl" value=""/><input type="hidden" name="partnerName" value=""/></>}<button className="customer-primary-action" type="submit" disabled={saving}>{saving?"Salvando…":"Salvar configurações da loja"}</button>
    </form></section>
    <section className="customer-panel customer-store-ai-entry"><div><span>✦ Importador IA</span><h2>Crie anúncios usando links de produtos</h2><p>Cole uma URL ou uma lista de links. A IA identifica fotos, título, descrição, preço e categoria para revisão antes da publicação.</p></div><a className="customer-primary-action" href="/lojista/importador-ia">Abrir Importador IA</a></section>
    <section className="customer-panel customer-store-import"><div><span>Importação de catálogo</span><h2>WordPress, API, XML ou JSON</h2><p>Importe arquivos estruturados ou sincronize o catálogo configurado acima.</p></div><label>Arquivo XML ou JSON<input type="file" accept=".xml,.json,application/xml,text/xml,application/json" onChange={event=>setImportFile(event.target.files?.[0]||null)}/></label><div><button className="customer-primary-action" type="button" disabled={importing||!importFile} onClick={()=>void importCatalog(false)}>{importing?"Processando…":"Importar arquivo"}</button><button className="customer-secondary-action" type="button" disabled={importing||!store?.feedUrl} onClick={()=>void importCatalog(true)}>Ler URL e sincronizar</button></div></section>
    <section className="customer-panel retailer-manual-listing"><h2>Cadastrar anúncio da loja</h2><form onSubmit={createStoreListing}><div className="customer-form-grid"><label>Título<input name="title" required minLength={5}/></label><label>Preço em reais<input name="price" inputMode="decimal"/></label><label>Categoria<input name="category" required/></label><label>Subcategoria<input name="subcategory" required/></label><label className="full">Descrição<textarea name="description" required minLength={20}/></label><label className="full">Endereço ou localização<input name="address" defaultValue={[store?.city,store?.state].filter(Boolean).join(" - ")}/></label><label className="full">Link específico do botão Comprar<input name="externalUrl" type="url" placeholder="https://sualoja.com.br/produto"/></label><label className="full">Imagem<input name="image" type="file" accept="image/jpeg,image/png,image/webp" required/></label></div><button className="customer-primary-action" disabled={manualBusy||!planCurrent}>{manualBusy?"Publicando…":"Publicar anúncio da loja"}</button></form></section>
    <section className="customer-panel retailer-listings"><header><h2>Anúncios da loja</h2><span>{storeListings.length} de {(store?.adLimit||0)>=999999?"∞":store?.adLimit||currentPlan.adLimit}</span></header>{storeListings.map(item=><article key={item.id}><img src={item.coverImage} alt=""/><div><b>{item.title}</b><span>{item.priceCents==null?"Valor a combinar":(item.priceCents/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})} · {item.source}</span></div><a href={store?`/loja/${store.slug}/anuncio/${item.id}`:"#"}>Ver</a></article>)}{!storeListings.length?<p>Nenhum anúncio cadastrado na loja.</p>:null}</section>
  </>;
  if (!store) return null;
  return <><SectionHeader section="loja" description="Configure sua página profissional, seu plano e as integrações do catálogo." action={store?.slug ? <a className="customer-secondary-action" href={`/loja/${store!.slug}`}>Ver loja pública</a> : null} /><section className="customer-store-plan-grid">{clientStorePlans.map((plan) => <label className={planCode === plan.code ? "selected" : ""} key={plan.code}><input type="radio" name="storePlan" checked={planCode === plan.code} onChange={() => setPlanCode(plan.code)} /><span>{plan.name}</span><strong>{plan.adLimit >= 999999 ? "Ilimitados" : `${plan.adLimit} anúncios`}</strong><small>{plan.priceCents ? `${(plan.priceCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/mês` : "Gratuito"}</small></label>)}</section><section className="customer-panel customer-settings-card customer-store-settings"><form onSubmit={saveStore}><h2>Identidade e URL profissional</h2><label className="customer-profile-photo">Logo da loja<span>{logoPreview ? <img src={logoPreview} alt="Prévia da logo" /> : <i>LOJA</i>}<b>{logoFile ? "Prévia pronta — salve a loja" : "Selecionar logo"}</b><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => selectLogo(event.target.files?.[0])} /></span></label><div className="customer-form-grid"><label>Nome da loja<input name="name" defaultValue={store?.name || customer.name} required minLength={3} /></label><label>Tipo de loja<select name="type" defaultValue={store?.type || "general"}><option value="general">Loja virtual</option><option value="real_estate">Imobiliária</option><option value="vehicle">Loja de veículos</option></select></label><label className="full">URL profissional<span className="professional-url-field"><b>/loja/</b><input name="slug" defaultValue={store?.slug || defaultSlug} required /></span></label><label className="full">Link externo padrão para o botão Comprar<input name="websiteUrl" type="url" defaultValue={store?.websiteUrl || ""} placeholder="https://www.sualoja.com.br/produto" /><small>O link específico importado com cada anúncio terá prioridade sobre este endereço.</small></label><label className="full">Descrição da loja<textarea name="description" defaultValue={store?.description || ""} required minLength={20} placeholder="Apresente sua empresa, especialidades e diferenciais." /></label></div><h2>Contato e localização</h2><div className="customer-form-grid"><label>E-mail comercial<input name="email" type="email" defaultValue={store?.email || customer.email} required /></label><label>WhatsApp profissional<input name="whatsapp" defaultValue={maskAccountPhone(store?.whatsapp || customer.whatsapp)} placeholder="(31) 99999-9999" /></label><label className="full">Endereço da loja<input name="address" defaultValue={store?.address || ""} placeholder="Rua, número e bairro" /></label><label>Cidade<input name="city" defaultValue={store?.city || ""} required /></label><label>UF<input name="state" defaultValue={store?.state || "MG"} maxLength={2} required /></label></div><h2>Integração do catálogo</h2><div className="store-integration-options">{(["manual", "xml", "json", "partner"] as const).map((type) => <label className={integrationType === type ? "selected" : ""} key={type}><input type="radio" checked={integrationType === type} onChange={() => setIntegrationType(type)} /><span>{type === "manual" ? "Cadastro manual" : type === "partner" ? "Site parceiro" : `Arquivo ${type.toUpperCase()}`}</span></label>)}</div>{integrationType !== "manual" ? <div className="customer-form-grid"><label>URL pública do feed<input name="feedUrl" type="url" defaultValue={store?.feedUrl || ""} placeholder="https://parceiro.com/catalogo.xml" /></label><label>Site ou sistema parceiro<input name="partnerName" defaultValue={store?.partnerName || ""} placeholder="Nome da plataforma" /></label></div> : <><input type="hidden" name="feedUrl" value="" /><input type="hidden" name="partnerName" value="" /></>}<button className="customer-primary-action" type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar loja virtual"}</button></form></section><section className="customer-panel customer-store-import"><div><span>Importação em massa</span><h2>XML, JSON e sites parceiros</h2><p>Envie um catálogo de até 5 MB ou sincronize a URL configurada. Para um link de compra específico por produto, use external_url, purchase_url, product_url ou link_compra.</p></div><label>Arquivo XML ou JSON<input type="file" accept=".xml,.json,application/xml,text/xml,application/json" onChange={(event) => setImportFile(event.target.files?.[0] || null)} /></label><div><button className="customer-primary-action" type="button" disabled={importing || !importFile} onClick={() => importCatalog(false)}>{importing ? "Processando…" : "Importar arquivo"}</button><button className="customer-secondary-action" type="button" disabled={importing || !store?.feedUrl} onClick={() => importCatalog(true)}>Sincronizar URL</button></div></section></>;
}

function PaymentsSection({ payments }: { payments: PaymentRecord[] }) {
  const [retry, setRetry] = useState<PaymentRecord | null>(null);
  const [method, setMethod] = useState<"pix" | "card">("pix");
  const [options, setOptions] = useState({ pix: true, card: true });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; qrCodeText?: string; qrCodeImage?: string; paid?: boolean } | null>(null);
  const statusLabel = (status: PaymentRecord["status"]) => status === "paid" ? "Pago" : status === "declined" ? "Não aprovado" : status === "failed" ? "Falhou" : status === "expired" ? "Expirado" : "Pendente";

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" }).then((response) => response.json()).then((data) => {
      const available = { pix: data.pagbank_pix_enabled !== false, card: data.pagbank_card_enabled !== false };
      setOptions(available); if (!available.pix && available.card) setMethod("card");
    }).catch(() => undefined);
  }, []);

  function openRetry(payment: PaymentRecord) {
    setRetry(payment); setResult(null); setMethod(options.pix ? "pix" : "card");
  }

  async function submitRetry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!retry) return; setBusy(true); setResult(null);
    try {
      const card = method === "card" ? await encryptPagBankCard(new FormData(event.currentTarget)) : {};
      const response = await fetch(`/api/customer/payments/${encodeURIComponent(retry.id)}/retry`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method, ...card }) });
      const data = await response.json().catch(() => ({})) as { error?: string; qrCodeText?: string; qrCodeImage?: string; paid?: boolean };
      if (!response.ok) setResult({ ok: false, message: data.error || "Não foi possível refazer o pagamento." });
      else setResult({ ok: true, qrCodeText: data.qrCodeText, qrCodeImage: data.qrCodeImage, paid: data.paid, message: method === "pix" ? "Novo pagamento Pix gerado. Use o QR Code ou o código Copia e Cola." : data.paid ? "Pagamento aprovado pelo PagBank." : "Pagamento enviado ao PagBank e aguardando confirmação." });
    } catch (error) {
      setResult({ ok: false, message: error instanceof Error ? error.message : "Não foi possível refazer o pagamento." });
    }
    setBusy(false);
  }

  return <>
    <SectionHeader section="pagamentos" description="Consulte pagamentos, valores, formas de pagamento e situações." />
    {payments.length ? <section className="customer-panel customer-payment-history"><div className="customer-payment-head"><span>Descrição</span><span>Forma</span><span>Data</span><span>Valor</span><span>Situação</span><span>Ação</span></div>{payments.map((payment) => <article key={payment.id}><div><strong>{payment.description}</strong><small>Referência: {payment.providerReference || payment.id.slice(0, 8)}</small>{payment.cardLast4 ? <small>{payment.cardBrand?.toUpperCase() || "Cartão"} final {payment.cardLast4}</small> : null}</div><span>{payment.method === "PIX" ? "Pix" : "Cartão"}</span><span>{formatDate(payment.createdAt)}</span><strong>{(payment.amountCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong><b className={`payment-history-status ${payment.status}`}>{statusLabel(payment.status)}</b>{["failed", "declined", "expired"].includes(payment.status) ? <button className="payment-retry-button" type="button" onClick={() => openRetry(payment)}>Refazer pagamento</button> : payment.status === "paid" ? <span className="payment-complete-label">Concluído</span> : <span className="payment-pending-label">Aguardando</span>}</article>)}</section> : <section className="customer-panel customer-section-panel"><EmptyAccountState icon="R$" title="Nenhum pagamento registrado" text="Os pagamentos de anúncios com destaque aparecerão aqui." /></section>}
    {retry ? <div className="account-highlight-modal payment-retry-modal" role="dialog" aria-modal="true" aria-label="Refazer pagamento"><form onSubmit={(event) => void submitRetry(event)}><header><div><span>Meus pagamentos</span><h2>Refazer pagamento</h2><small>{retry.description} · {(retry.amountCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</small></div><button type="button" onClick={() => { setRetry(null); if (result?.ok) window.location.reload(); }} aria-label="Fechar">×</button></header><div className="highlight-payment-method">{options.pix ? <label><input type="radio" checked={method === "pix"} onChange={() => { setMethod("pix"); setResult(null); }} /> Pix com QR Code</label> : null}{options.card ? <label><input type="radio" checked={method === "card"} onChange={() => { setMethod("card"); setResult(null); }} /> Cartão de crédito</label> : null}</div>{method === "card" ? <PagBankCardFields /> : <p className="payment-security-note">O PagBank gerará um novo QR Code Pix, com nova referência e validade.</p>}{result ? <div className={`payment-retry-result ${result.ok ? "success" : "error"}`} role="status"><p>{result.message}</p>{result.qrCodeImage ? <img src={result.qrCodeImage} alt="QR Code para pagamento Pix" /> : null}{result.qrCodeText ? <><label>Pix Copia e Cola<textarea value={result.qrCodeText} readOnly /></label><button type="button" onClick={() => void navigator.clipboard.writeText(result.qrCodeText || "")}>Copiar código Pix</button></> : null}</div> : null}<footer><button type="button" className="customer-secondary-action" onClick={() => { setRetry(null); if (result?.ok) window.location.reload(); }}>Fechar</button><button type="submit" className="customer-primary-action" disabled={busy || !options.pix && !options.card}>{busy ? "Processando…" : method === "pix" ? "Gerar QR Code Pix" : "Pagar com cartão"}</button></footer></form></div> : null}
  </>;
}

function InvoicesSection({ invoices }: { invoices: InvoiceRecord[] }) {
  const statusLabel = (status: InvoiceRecord["status"]) => status === "paid" ? "Quitada" : status === "failed" ? "Pagamento falhou" : status === "cancelled" ? "Cancelada" : "Pendente";
  return <>
    <SectionHeader section="faturas" description="Consulte e salve em PDF as faturas emitidas para seus anúncios." />
    {invoices.length ? <section className="customer-panel customer-invoice-history">
      <div className="customer-invoice-head"><span>Fatura</span><span>Emissão</span><span>Valor</span><span>Situação</span><span>Arquivo</span></div>
      {invoices.map((invoice) => <article key={invoice.id}>
        <div><strong>{invoice.invoiceNumber}</strong><span>{invoice.listingTitle}</span><small>{invoice.description}</small></div>
        <span>{formatDate(invoice.issuedAt)}</span>
        <strong>{(invoice.amountCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong>
        <b className={`payment-history-status ${invoice.status}`}>{statusLabel(invoice.status)}</b>
        <a className="invoice-download-button" href={`/api/customer/invoices/${encodeURIComponent(invoice.id)}`} target="_blank" rel="noopener">Salvar PDF</a>
      </article>)}
    </section> : <section className="customer-panel customer-section-panel"><EmptyAccountState icon="▤" title="Nenhuma fatura emitida" text="As faturas dos anúncios publicados aparecerão aqui." /></section>}
  </>;
}

function ReportsSection({ payments, contactAnalytics }: { payments: PaymentRecord[]; contactAnalytics: ListingContactAnalytics[] }) {
  const paid = payments.filter((payment) => payment.status === "paid"); const totalPaid = paid.reduce((total, payment) => total + payment.amountCents, 0);
  const totals = contactAnalytics.reduce((sum, item) => ({ phoneUsers: sum.phoneUsers + item.phoneUsers, phoneVisitors: sum.phoneVisitors + item.phoneVisitors, whatsappUsers: sum.whatsappUsers + item.whatsappUsers, whatsappVisitors: sum.whatsappVisitors + item.whatsappVisitors }), { phoneUsers: 0, phoneVisitors: 0, whatsappUsers: 0, whatsappVisitors: 0 });
  return <><SectionHeader section="relatorios" description="Analise os contatos recebidos nos anúncios e o investimento em destaques." /><div className="customer-metric-grid compact"><article className="red"><i>☎</i><span>Cliques no telefone<strong>{totals.phoneUsers + totals.phoneVisitors}</strong><small>{totals.phoneUsers} usuários · {totals.phoneVisitors} visitantes</small></span></article><article className="orange"><i>W</i><span>Cliques no WhatsApp<strong>{totals.whatsappUsers + totals.whatsappVisitors}</strong><small>{totals.whatsappUsers} usuários · {totals.whatsappVisitors} visitantes</small></span></article><article className="green"><i>R$</i><span>Pagamentos aprovados<strong>{paid.length}</strong><small>{(totalPaid / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</small></span></article></div>{contactAnalytics.length ? <section className="customer-panel customer-contact-report"><div className="customer-contact-report-head"><span>Anúncio</span><span>Telefone</span><span>WhatsApp</span><span>Total</span></div>{contactAnalytics.map((item) => <article key={item.listingId}><div><strong>{item.title}</strong><a href={`/anuncio/${encodeURIComponent(item.listingId)}`}>Abrir anúncio</a></div><span><b>{item.phoneUsers + item.phoneVisitors}</b><small>{item.phoneUsers} usuários · {item.phoneVisitors} visitantes</small></span><span><b>{item.whatsappUsers + item.whatsappVisitors}</b><small>{item.whatsappUsers} usuários · {item.whatsappVisitors} visitantes</small></span><strong>{item.phoneUsers + item.phoneVisitors + item.whatsappUsers + item.whatsappVisitors}</strong></article>)}</section> : <section className="customer-panel customer-section-panel"><EmptyAccountState icon="▥" title="Nenhum contato registrado" text="Os cliques de usuários identificados e visitantes aparecerão neste relatório." /></section>}</>;
}

function SettingsSection({ customer, saveProfile }: { customer: CustomerRecord; saveProfile: (input: { name: string; whatsapp: string; profileImageUrl: string }) => Promise<boolean> }) {
  const publicProfileSlug = customer.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const [phone, setPhone] = useState(maskAccountPhone(customer.whatsapp));
  const [profileImageUrl, setProfileImageUrl] = useState(customer.profileImageUrl || "");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [profilePreview, setProfilePreview] = useState(customer.profileImageUrl || "");
  const [saving, setSaving] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [savedCards, setSavedCards] = useState<Array<{ id: string; brand: string | null; last4: string; holderName: string; createdAt: string }>>([]);

  useEffect(() => {
    fetch("/api/customer/saved-cards", { cache: "no-store" }).then((response) => response.json()).then((data) => setSavedCards(Array.isArray(data.cards) ? data.cards : [])).catch(() => setSavedCards([]));
  }, []);

  async function removeSavedCard(id: string) {
    const response = await fetch(`/api/customer/saved-cards?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (response.ok) setSavedCards((current) => current.filter((card) => card.id !== id));
  }

  function selectProfile(file?: File) {
    if (!file) return;
    const validationError = validateProfileImage(file);
    if (validationError) return setUploadError(validationError);
    setUploadError("");
    if (profilePreview.startsWith("blob:")) URL.revokeObjectURL(profilePreview);
    setPhotoFile(file);
    setProfilePreview(createProfilePreview(file));
  }

  async function submitSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setUploadError("");
    try {
      let savedImageUrl = profileImageUrl;
      if (photoFile) savedImageUrl = await uploadProfileImage(photoFile);
      const form = new FormData(event.currentTarget);
      const saved = await saveProfile({ name: String(form.get("name") || ""), whatsapp: phone, profileImageUrl: savedImageUrl });
      if (saved) {
        setProfileImageUrl(savedImageUrl);
        setProfilePreview(savedImageUrl);
        setPhotoFile(null);
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Não foi possível enviar a foto.");
    } finally {
      setSaving(false);
    }
  }

  return <><SectionHeader section="configuracoes" description="Atualize seus dados de contato e informações da conta." action={<a className="customer-secondary-action" href={`/anunciantes/${publicProfileSlug}`}>Ver perfil público</a>} /><section className="customer-panel customer-settings-card"><form onSubmit={submitSettings}>
    <label className="customer-profile-photo">Foto do perfil<span>{profilePreview ? <img src={profilePreview} alt={`Prévia da foto de ${customer.name}`} /> : <i>{customer.name.slice(0, 2).toUpperCase()}</i>}<b>{photoFile ? "Prévia pronta — clique em salvar" : saving ? "Salvando foto…" : "Selecionar nova foto"}</b><input type="file" accept="image/jpeg,image/png,image/webp" disabled={saving} onChange={(event) => selectProfile(event.target.files?.[0])} /></span></label>
    {uploadError ? <p className="customer-upload-error" role="alert">{uploadError}</p> : null}
    <div className="customer-form-grid"><label>Nome completo<input name="name" defaultValue={customer.name} required minLength={3} /></label><label>WhatsApp<input name="whatsapp" type="tel" value={phone} onChange={(event) => setPhone(maskAccountPhone(event.target.value))} inputMode="tel" placeholder="(31) 99999-9999" required /></label><label>E-mail<input value={customer.email} readOnly aria-readonly="true" /></label><label>{customer.accountType === "empresa" ? "CNPJ" : "CPF"}<input value={customer.accountType === "empresa" ? maskAccountCnpj(customer.taxId) : maskAccountCpf(customer.taxId)} readOnly aria-readonly="true" /></label><label>Tipo de conta<input value={customer.accountType === "empresa" ? "Empresa" : "Particular"} readOnly aria-readonly="true" /></label><label>Plano<input value={customer.planName} readOnly aria-readonly="true" /></label><label>Data do cadastro<input value={formatDate(customer.createdAt)} readOnly aria-readonly="true" /></label></div><button className="customer-primary-action" type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar alterações"}</button></form></section><section className="customer-panel customer-settings-card saved-cards-settings"><h2>Cartões salvos</h2><p>Os cartões são tokenizados pelo PagBank. O portal não armazena número completo, validade ou CVV.</p>{savedCards.length ? <div>{savedCards.map((card) => <article key={card.id}><span><strong>{card.brand?.toUpperCase() || "Cartão"} final {card.last4}</strong><small>{card.holderName} · salvo em {formatDate(card.createdAt)}</small></span><button type="button" onClick={() => void removeSavedCard(card.id)}>Remover</button></article>)}</div> : <div className="saved-card-empty"><strong>Nenhum cartão tokenizado</strong><span>Ao pagar um destaque com cartão, marque “Salvar este cartão com segurança no PagBank”.</span></div>}</section></>;
}

function ReviewsSection() {
  return <><SectionHeader section="avaliacoes" description="Acompanhe as avaliações recebidas nas suas negociações." /><section className="customer-panel customer-section-panel"><EmptyAccountState icon="☆" title="Nenhuma avaliação recebida" text="As avaliações concluídas aparecerão nesta página." /></section></>;
}

function CouponsSection() {
  return <><SectionHeader section="cupons" description="Consulte cupons e benefícios vinculados à sua conta." /><section className="customer-panel customer-section-panel"><EmptyAccountState icon="▤" title="Nenhum cupom disponível" text="Cupons válidos e benefícios promocionais aparecerão aqui." /></section></>;
}

function HelpSection({ tickets, openTicket }: { tickets: SupportTicket[]; openTicket: (event: FormEvent<HTMLFormElement>) => void }) {
  return <><SectionHeader section="ajuda" description="Envie uma solicitação e acompanhe seus chamados." /><div className="customer-help-grid"><section className="customer-panel customer-settings-card"><h2>Abrir chamado</h2><form onSubmit={openTicket}><label>Assunto<input name="subject" required minLength={3} placeholder="Ex.: Dúvida sobre meu plano" /></label><label>Mensagem<textarea name="message" required minLength={10} placeholder="Descreva sua solicitação" /></label><button className="customer-primary-action" type="submit">Enviar chamado</button></form></section><section className="customer-panel customer-ticket-list"><h2>Meus chamados</h2>{tickets.length === 0 ? <EmptyAccountState icon="?" title="Nenhum chamado" text="Seus pedidos de suporte aparecerão aqui." /> : tickets.map((ticket) => <article key={ticket.id}><div><strong>#{ticket.id} · {ticket.subject}</strong><span>{formatDate(ticket.createdAt)}</span></div><b>{ticket.status === "open" ? "Aberto" : ticket.status}</b><p>{ticket.message}</p></article>)}</section></div></>;
}
