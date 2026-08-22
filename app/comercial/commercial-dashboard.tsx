"use client";
/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-img-element */

import { FormEvent, useEffect, useMemo, useState } from "react";
import { portalCategories } from "../categories";

type Section = "advertisers" | "listings" | "create" | "sales" | "approval";
type Advertiser = { id: number; name: string; email: string; whatsapp: string; accountType: string; taxId: string; planName: string; adLimit: number; activeAds: number; createdAt: string };
type Listing = {
  id: string; title: string; category: string; subcategory: string; status: string; publicationType: string;
  featuredPlan: string | null; paymentAmountCents: number | null; formattedPrice: string; coverImage: string | null;
  createdAt: string | null; seller: { name?: string; email?: string };
};
type DashboardData = { operator: { email: string }; advertisers: Advertiser[]; listings: Listing[] };

const sections: Array<{ id: Section; icon: string; label: string }> = [
  { id: "advertisers", icon: "♙", label: "Anunciantes" },
  { id: "listings", icon: "▤", label: "Anúncios do site" },
  { id: "create", icon: "＋", label: "Cadastrar anúncio" },
  { id: "sales", icon: "◆", label: "Vender destaque" },
  { id: "approval", icon: "✓", label: "Aprovar anúncios" },
];

function statusLabel(status: string) {
  return status === "active" ? "Publicado" : status === "pending_review" ? "Pendente" : status === "rejected" ? "Rejeitado" : status === "awaiting_payment" ? "Aguardando pagamento" : status;
}
function money(cents: number | null | undefined) { return ((cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

export default function CommercialDashboard({ operatorEmail }: { operatorEmail: string }) {
  const [section, setSection] = useState<Section>("advertisers");
  const [data, setData] = useState<DashboardData>({ operator: { email: operatorEmail }, advertisers: [], listings: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [showAdvertiserForm, setShowAdvertiserForm] = useState(false);
  const [query, setQuery] = useState("");
  const [listingCategory, setListingCategory] = useState("");
  const [listingSubcategory, setListingSubcategory] = useState("");
  const [selectedAdvertiserId, setSelectedAdvertiserId] = useState("");
  const [listingFiles, setListingFiles] = useState<File[]>([]);

  async function reload() {
    const response = await fetch("/api/commercial/dashboard", { cache: "no-store" });
    if (response.status === 401) { location.href = "/comercial/login"; return; }
    const payload = await response.json() as DashboardData;
    setData(payload);
    setLoading(false);
  }
  useEffect(() => { queueMicrotask(() => void reload()); }, []);

  function flash(message: string) {
    setNotice(message); setError("");
    window.setTimeout(() => setNotice(""), 4500);
  }
  async function action(payload: Record<string, unknown>) {
    const response = await fetch("/api/commercial/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({})) as { error?: string; message?: string };
    if (!response.ok) throw new Error(result.error || "Não foi possível concluir a operação.");
    return result;
  }

  const filteredAdvertisers = useMemo(() => data.advertisers.filter((item) => `${item.name} ${item.email} ${item.whatsapp}`.toLowerCase().includes(query.toLowerCase())), [data.advertisers, query]);
  const filteredListings = useMemo(() => data.listings.filter((item) => `${item.title} ${item.category} ${item.seller.name || ""} ${item.seller.email || ""}`.toLowerCase().includes(query.toLowerCase())), [data.listings, query]);
  const pending = useMemo(() => data.listings.filter((item) => item.status === "pending_review"), [data.listings]);
  const selectedAdvertiser = data.advertisers.find((item) => String(item.id) === selectedAdvertiserId);
  const selectedCategory = portalCategories.find((item) => item.name === listingCategory);

  async function createAdvertiser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await action({ action: "create-advertiser", accountType: form.get("accountType"), taxId: form.get("taxId"), name: form.get("name"), email: form.get("email"), whatsapp: form.get("whatsapp"), password: form.get("password") });
      event.currentTarget.reset(); setShowAdvertiserForm(false); await reload(); flash(result.message || "Anunciante cadastrado.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível cadastrar."); } finally { setBusy(false); }
  }

  async function uploadListingImages() {
    const urls: string[] = [];
    for (const file of listingFiles.slice(0, 12)) {
      const form = new FormData(); form.append("file", file);
      const response = await fetch("/api/commercial/upload", { method: "POST", body: form });
      const result = await response.json().catch(() => ({})) as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error || "Falha ao enviar uma imagem.");
      urls.push(result.url);
    }
    return urls;
  }

  async function createListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const images = await uploadListingImages();
      const highlighted = form.get("publicationType") === "featured";
      const result = await action({
        action: "create-listing", userId: Number(form.get("userId")), title: form.get("title"), description: form.get("description"),
        category: listingCategory, subcategory: listingSubcategory, negotiationType: form.get("negotiationType"), address: form.get("address"),
        displayName: form.get("displayName"), whatsapp: form.get("whatsapp"), priceCents: Math.round(Number(form.get("price")) * 100),
        negotiable: form.get("negotiable") === "on", videoUrl: form.get("videoUrl"), images,
        publicationType: highlighted ? "featured" : "free", featuredPlan: form.get("featuredPlan"), saleAmountCents: highlighted ? Math.round(Number(form.get("saleAmount")) * 100) : 0,
      });
      event.currentTarget.reset(); setListingFiles([]); setListingCategory(""); setListingSubcategory(""); setSelectedAdvertiserId(""); await reload(); setSection("approval"); flash(result.message || "Anúncio cadastrado.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível cadastrar o anúncio."); } finally { setBusy(false); }
  }

  async function moderate(listingId: string, decision: "approve" | "reject") {
    setBusy(true); setError("");
    try { const result = await action({ action: "moderate", listingId, decision }); await reload(); flash(result.message || "Situação atualizada."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível moderar."); } finally { setBusy(false); }
  }

  async function sellHighlight(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await action({ action: "sell-highlight", listingId: form.get("listingId"), planCode: form.get("planCode"), amountCents: Math.round(Number(form.get("amount")) * 100) });
      event.currentTarget.reset(); await reload(); flash(result.message || "Venda registrada.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível registrar a venda."); } finally { setBusy(false); }
  }

  return (
    <main className="commercial-dashboard">
      <aside className="commercial-sidebar">
        <a className="commercial-brand" href="/"><img src="/logo-balcao.webp" alt="Portal Balcão" /><span>Área comercial</span></a>
        <nav aria-label="Menu comercial">{sections.map((item) => <button key={item.id} className={section === item.id ? "active" : ""} type="button" onClick={() => { setSection(item.id); setQuery(""); setError(""); }}><i>{item.icon}</i>{item.label}{item.id === "approval" && pending.length ? <b>{pending.length}</b> : null}</button>)}</nav>
        <div className="commercial-operator"><span>Operador conectado</span><strong>{operatorEmail}</strong></div>
        <button className="commercial-exit" type="button" onClick={() => fetch("/api/commercial/logout", { method: "POST" }).finally(() => { location.href = "/comercial/login"; })}>Sair do painel</button>
      </aside>
      <section className="commercial-content">
        <header className="commercial-topbar"><div><span>Portal Balcão</span><strong>Gestão comercial</strong></div><a href="/" target="_blank">Abrir site ↗</a></header>
        {notice ? <div className="commercial-notice" role="status">✓ {notice}</div> : null}
        {error ? <div className="commercial-error" role="alert">{error}</div> : null}
        {loading ? <div className="commercial-loading">Carregando dados comerciais…</div> : null}

        {!loading && section === "advertisers" ? <section className="commercial-section">
          <div className="commercial-section-head"><div><span>Anunciantes</span><h1>Clientes cadastrados</h1><p>Cadastre e consulte anunciantes integrados à mesma base do portal.</p></div><button className="primary-button" type="button" onClick={() => setShowAdvertiserForm((current) => !current)}>+ Novo anunciante</button></div>
          {showAdvertiserForm ? <form className="commercial-form-card" onSubmit={createAdvertiser}><h2>Cadastrar anunciante</h2><div className="commercial-form-grid"><label>Tipo de conta<select name="accountType"><option value="particular">Particular</option><option value="empresa">Empresa</option></select></label><label>CPF ou CNPJ<input name="taxId" required inputMode="numeric" /></label><label>Nome ou razão social<input name="name" required /></label><label>E-mail<input name="email" type="email" required /></label><label>WhatsApp<input name="whatsapp" required inputMode="tel" /></label><label>Senha temporária<input name="password" type="password" minLength={8} required /></label></div><footer><button type="button" className="soft-button" onClick={() => setShowAdvertiserForm(false)}>Cancelar</button><button className="primary-button" disabled={busy}>{busy ? "Salvando…" : "Salvar anunciante"}</button></footer></form> : null}
          <div className="commercial-toolbar"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, e-mail ou WhatsApp" /><span>{filteredAdvertisers.length} anunciante(s)</span></div>
          <div className="commercial-table-wrap"><table><thead><tr><th>Anunciante</th><th>Contato</th><th>Plano</th><th>Anúncios</th><th>Cadastro</th></tr></thead><tbody>{filteredAdvertisers.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><small>{item.accountType === "empresa" ? "Empresa" : "Particular"} · {item.taxId}</small></td><td><span>{item.email}</span><small>{item.whatsapp}</small></td><td>{item.planName}</td><td>{item.activeAds}/{item.adLimit}</td><td>{new Date(item.createdAt).toLocaleDateString("pt-BR")}</td></tr>)}</tbody></table></div>
        </section> : null}

        {!loading && section === "listings" ? <section className="commercial-section">
          <div className="commercial-section-head"><div><span>Anúncios</span><h1>Anúncios do site</h1><p>Consulte anúncios publicados, pendentes, gratuitos e destacados.</p></div><button className="primary-button" type="button" onClick={() => setSection("create")}>+ Cadastrar anúncio</button></div>
          <div className="commercial-toolbar"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar anúncio, categoria ou anunciante" /><span>{filteredListings.length} anúncio(s)</span></div>
          <div className="commercial-listings">{filteredListings.map((item) => <article key={item.id}>{item.coverImage ? <img src={item.coverImage} alt="" /> : <div className="commercial-no-image">Sem imagem</div>}<div><small>{item.category} · {item.subcategory}</small><h3>{item.title}</h3><p>{item.seller.name || "Anunciante"} · {item.seller.email || ""}</p><strong>{item.formattedPrice}</strong></div><aside><span className={`commercial-status ${item.status}`}>{statusLabel(item.status)}</span>{item.publicationType === "featured" ? <b>◆ Destaque</b> : <b>Grátis</b>}<a href={`/anuncio/${encodeURIComponent(item.id)}`} target="_blank">Abrir anúncio ↗</a></aside></article>)}</div>
        </section> : null}

        {!loading && section === "create" ? <section className="commercial-section">
          <div className="commercial-section-head"><div><span>Novo anúncio</span><h1>Cadastrar anúncio</h1><p>O anúncio será vinculado ao anunciante selecionado e enviado para aprovação.</p></div></div>
          <form className="commercial-form-card commercial-listing-form" onSubmit={createListing}>
            <h2>Anunciante e categoria</h2><div className="commercial-form-grid three"><label>Anunciante<select name="userId" value={selectedAdvertiserId} onChange={(event) => setSelectedAdvertiserId(event.target.value)} required><option value="">Selecione</option>{data.advertisers.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.email}</option>)}</select></label><label>Categoria<select value={listingCategory} onChange={(event) => { setListingCategory(event.target.value); setListingSubcategory(""); }} required><option value="">Selecione</option>{portalCategories.map((item) => <option key={item.name}>{item.name}</option>)}</select></label><label>Subcategoria<select value={listingSubcategory} onChange={(event) => setListingSubcategory(event.target.value)} required disabled={!selectedCategory}><option value="">Selecione</option>{selectedCategory?.subs.map((item) => <option key={item}>{item}</option>)}</select></label></div>
            <h2>Conteúdo do anúncio</h2><div className="commercial-form-grid"><label className="full">Título<input name="title" minLength={8} maxLength={120} required /></label><label className="full">Descrição<textarea name="description" minLength={30} maxLength={5000} rows={6} required /></label><label>Tipo de negociação<select name="negotiationType"><option>Venda</option><option>Aluguel</option><option>Serviço</option><option>Troca</option><option>Compra</option></select></label><label>Preço (R$)<input name="price" type="number" min="0" step="0.01" /></label><label className="commercial-checkbox"><input name="negotiable" type="checkbox" /> Valor a combinar</label><label className="full">Localização<input name="address" placeholder="Bairro, cidade e estado" required /></label><label>Nome de exibição<input name="displayName" defaultValue={selectedAdvertiser?.name || ""} key={`name-${selectedAdvertiserId}`} required /></label><label>WhatsApp<input name="whatsapp" defaultValue={selectedAdvertiser?.whatsapp || ""} key={`phone-${selectedAdvertiserId}`} required /></label><label className="full">Link de vídeo (opcional)<input name="videoUrl" type="url" placeholder="https://..." /></label></div>
            <h2>Imagens</h2><label className="commercial-upload">＋<strong>Selecionar imagens</strong><span>Até 12 arquivos JPG, PNG, WebP ou AVIF</span><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple onChange={(event) => setListingFiles(Array.from(event.target.files || []).slice(0, 12))} required /></label>{listingFiles.length ? <div className="commercial-image-preview">{listingFiles.map((file) => <span key={`${file.name}-${file.size}`}><img src={URL.createObjectURL(file)} alt="" />{file.name}</span>)}</div> : null}
            <h2>Tipo de publicação</h2><div className="commercial-publication"><label><input type="radio" name="publicationType" value="free" defaultChecked /> <strong>Anúncio grátis</strong><span>30 dias e aprovação obrigatória</span></label><label><input type="radio" name="publicationType" value="featured" /> <strong>Anúncio com destaque</strong><span>Venda registrada pela equipe comercial</span></label></div><div className="commercial-form-grid"><label>Período do destaque<select name="featuredPlan"><option value="monthly">30 dias</option><option value="quarterly">90 dias</option><option value="semiannual">180 dias</option></select></label><label>Valor da venda (R$)<input name="saleAmount" type="number" min="0" step="0.01" /></label></div>
            <footer><button className="primary-button" disabled={busy}>{busy ? "Salvando e enviando imagens…" : "Cadastrar anúncio"}</button></footer>
          </form>
        </section> : null}

        {!loading && section === "sales" ? <section className="commercial-section">
          <div className="commercial-section-head"><div><span>Venda</span><h1>Vender anúncio destacado</h1><p>Transforme um anúncio existente em destaque e registre o valor comercial.</p></div></div>
          <form className="commercial-form-card commercial-sale-form" onSubmit={sellHighlight}><label>Anúncio<select name="listingId" required><option value="">Selecione o anúncio</option>{data.listings.map((item) => <option key={item.id} value={item.id}>{item.title} — {item.seller.name || "Anunciante"}</option>)}</select></label><label>Período<select name="planCode"><option value="monthly">30 dias</option><option value="quarterly">90 dias</option><option value="semiannual">180 dias</option></select></label><label>Valor da venda (R$)<input name="amount" type="number" min="0.01" step="0.01" required /></label><button className="primary-button" disabled={busy}>{busy ? "Registrando…" : "Registrar venda e aplicar destaque"}</button></form>
          <div className="commercial-summary-grid"><article><span>Anúncios destacados</span><strong>{data.listings.filter((item) => item.publicationType === "featured").length}</strong></article><article><span>Valor registrado nos anúncios</span><strong>{money(data.listings.reduce((total, item) => total + (item.paymentAmountCents || 0), 0))}</strong></article></div>
        </section> : null}

        {!loading && section === "approval" ? <section className="commercial-section">
          <div className="commercial-section-head"><div><span>Moderação</span><h1>Anúncios pendentes</h1><p>A aprovação publica o anúncio imediatamente no Portal Balcão.</p></div><b className="commercial-pending-count">{pending.length} pendente(s)</b></div>
          <div className="commercial-approval-list">{pending.map((item) => <article key={item.id}>{item.coverImage ? <img src={item.coverImage} alt="" /> : null}<div><small>{item.category} · {item.subcategory}</small><h3>{item.title}</h3><p>{item.seller.name || "Anunciante"} · {item.seller.email || ""}</p><strong>{item.formattedPrice}{item.publicationType === "featured" ? " · Destaque vendido" : " · Gratuito"}</strong></div><footer><a className="soft-button" href={`/anuncio/${encodeURIComponent(item.id)}`} target="_blank">Visualizar</a><button className="commercial-reject" type="button" disabled={busy} onClick={() => void moderate(item.id, "reject")}>Rejeitar</button><button className="primary-button" type="button" disabled={busy} onClick={() => void moderate(item.id, "approve")}>Aprovar e publicar</button></footer></article>)}{!pending.length ? <div className="commercial-empty"><span>✓</span><h2>Nenhum anúncio pendente</h2><p>A fila de aprovação está atualizada.</p></div> : null}</div>
        </section> : null}
      </section>
    </main>
  );
}
