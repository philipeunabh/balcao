"use client";
/* eslint-disable @next/next/no-img-element, @next/next/no-html-link-for-pages */

import { useEffect, useMemo, useState } from "react";
import { portalCategories } from "./categories";

type ImportScope = "user" | "store";
type Draft = {
  sourceUrl: string; externalUrl: string; title: string; description: string; priceCents: number | null;
  category: string; subcategory: string; negotiationType: string; address: string; images: string[];
  features: string[]; confidence: number;
};
type SavedRecord = { id: string; status: string; title: string };
type StoredDraft = { id: string; title: string; status: string; createdAt?: string };

function money(value: number | null) {
  return value == null ? "" : (value / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toCents(value: string) {
  const normalized = value.replace(/\s/g, "").replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  if (!normalized) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null;
}

export function AiListingImporter({ scope }: { scope: ImportScope }) {
  const [urls, setUrls] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [storedDrafts, setStoredDrafts] = useState<StoredDraft[]>([]);
  const [failures, setFailures] = useState<Array<{ url?: string; title?: string; error: string }>>([]);
  const [saved, setSaved] = useState<SavedRecord[]>([]);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState<"draft" | "publish" | "">("");
  const [message, setMessage] = useState("");
  const linkCount = useMemo(() => urls.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean).length, [urls]);

  useEffect(() => {
    fetch(`/api/customer/ai-import?scope=${scope}`, { cache: "no-store" }).then((response) => response.json()).then((data) => {
      setStoredDrafts(Array.isArray(data.drafts) ? data.drafts : []);
    }).catch(() => undefined);
  }, [scope]);

  function updateDraft(index: number, patch: Partial<Draft>) {
    setDrafts((current) => current.map((item, position) => position === index ? { ...item, ...patch } : item));
  }

  async function processLinks() {
    if (!linkCount) return setMessage("Cole pelo menos um link público para processar.");
    setProcessing(true); setMessage(""); setFailures([]); setSaved([]);
    try {
      const response = await fetch("/api/customer/ai-import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ urls: urls.split(/[\n,]+/) }) });
      const data = await response.json() as { drafts?: Draft[]; failures?: Array<{ url: string; error: string }>; error?: string; message?: string };
      setFailures(data.failures || []);
      if (!response.ok || !data.drafts?.length) throw new Error(data.error || "Não foi possível gerar anúncios.");
      setDrafts(data.drafts);
      setMessage(data.message || "Anúncios gerados para revisão.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível gerar anúncios."); }
    finally { setProcessing(false); }
  }

  async function save(mode: "draft" | "publish") {
    if (!drafts.length) return;
    setSaving(mode); setMessage(""); setFailures([]);
    try {
      const response = await fetch("/api/customer/ai-import", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope, mode, drafts }) });
      const data = await response.json() as { saved?: SavedRecord[]; failures?: Array<{ title: string; error: string }>; error?: string; message?: string };
      setFailures(data.failures || []);
      if (!response.ok || !data.saved?.length) throw new Error(data.error || "Não foi possível salvar os anúncios.");
      setSaved(data.saved); setMessage(data.message || "Anúncios salvos."); setDrafts([]); setUrls("");
      if (mode === "draft") setStoredDrafts((current) => [...data.saved!.map((item) => ({ ...item, createdAt: new Date().toISOString() })), ...current]);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível salvar os anúncios."); }
    finally { setSaving(""); }
  }

  return <section className="ai-importer-shell">
    <div className="ai-importer-hero">
      <div><span className="ai-importer-kicker">Importador IA</span><h2>Transforme links em anúncios completos</h2><p>Cole a URL de um produto, imóvel, veículo ou serviço. Para importar vários itens, informe um link por linha. A inteligência artificial identifica fotos, título, descrição, preço e categoria para você revisar.</p></div>
      <ol aria-label="Etapas da importação"><li className="active"><b>1</b><span>Colar links</span></li><li className={drafts.length ? "active" : ""}><b>2</b><span>Revisar</span></li><li className={saved.length ? "active" : ""}><b>3</b><span>Salvar ou publicar</span></li></ol>
    </div>
    <div className="ai-importer-input">
      <label htmlFor={`ai-import-urls-${scope}`}>URL ou lista de URLs <small>até 10 links por processamento</small></label>
      <textarea id={`ai-import-urls-${scope}`} rows={6} value={urls} onChange={(event) => setUrls(event.target.value)} placeholder={"https://loja.com.br/produto-1\nhttps://loja.com.br/produto-2"} disabled={processing || Boolean(saving)} />
      <div><span>{linkCount} link(s) informado(s)</span><button className="customer-primary-action" type="button" onClick={() => void processLinks()} disabled={processing || !linkCount || Boolean(saving)}>{processing ? "Lendo páginas e gerando…" : "✦ Processar com IA"}</button></div>
    </div>
    {message ? <div className="ai-importer-message" role="status">{message}</div> : null}
    {failures.length ? <div className="ai-importer-failures" role="alert"><strong>Itens que precisam de atenção</strong>{failures.map((item, index) => <p key={`${item.url || item.title}-${index}`}><b>{item.title || item.url}</b>{item.error}</p>)}</div> : null}
    {drafts.length ? <div className="ai-importer-review"><header><div><span>Revisão</span><h3>{drafts.length} anúncio(s) gerado(s)</h3><p>Confira e edite os campos antes de salvar.</p></div><button type="button" onClick={() => setDrafts([])}>Descartar todos</button></header>
      <div className="ai-importer-drafts">{drafts.map((draft, index) => {
        const category = portalCategories.find((item) => item.name === draft.category);
        return <article className="ai-importer-card" key={`${draft.sourceUrl}-${index}`}>
          <div className="ai-importer-card-media">{draft.images[0] ? <img src={draft.images[0]} alt="Prévia encontrada na página" /> : <div>Sem foto encontrada</div>}<span>{draft.images.length} foto(s)</span><em>{draft.confidence}% de confiança</em></div>
          <div className="ai-importer-card-form">
            <div className="ai-importer-source"><span>Origem</span><a href={draft.sourceUrl} target="_blank" rel="noreferrer">{new URL(draft.sourceUrl).hostname} ↗</a></div>
            <label>Título<input value={draft.title} maxLength={120} onChange={(event) => updateDraft(index, { title: event.target.value })} /></label>
            <label>Descrição<textarea rows={5} value={draft.description} maxLength={5000} onChange={(event) => updateDraft(index, { description: event.target.value })} /></label>
            <div className="ai-importer-fields"><label>Preço em reais<input value={money(draft.priceCents)} inputMode="decimal" placeholder="Valor a combinar" onChange={(event) => updateDraft(index, { priceCents: toCents(event.target.value) })} /></label><label>Tipo<select value={draft.negotiationType} onChange={(event) => updateDraft(index, { negotiationType: event.target.value })}>{["Venda","Aluguel","Troca","Compra","Temporada","Serviço","Outra"].map((item) => <option key={item}>{item}</option>)}</select></label><label>Categoria<select value={draft.category} onChange={(event) => { const next = portalCategories.find((item) => item.name === event.target.value)!; updateDraft(index, { category: next.name, subcategory: next.subs[0] }); }}>{portalCategories.map((item) => <option key={item.name}>{item.name}</option>)}</select></label><label>Subcategoria<select value={draft.subcategory} onChange={(event) => updateDraft(index, { subcategory: event.target.value })}>{category?.subs.map((item) => <option key={item}>{item}</option>)}</select></label></div>
            <label>Localização<input value={draft.address} onChange={(event) => updateDraft(index, { address: event.target.value })} placeholder="Cidade, bairro ou endereço" /></label>
            <label>Link do anúncio ou botão Comprar<input type="url" value={draft.externalUrl} onChange={(event) => updateDraft(index, { externalUrl: event.target.value })} /></label>
            {draft.images.length > 1 ? <div className="ai-importer-images">{draft.images.map((image, imageIndex) => <button className={imageIndex === 0 ? "active" : ""} type="button" key={image} onClick={() => updateDraft(index, { images: [image, ...draft.images.filter((item) => item !== image)] })}><img src={image} alt={`Imagem ${imageIndex + 1}`} /><span>{imageIndex === 0 ? "Capa" : "Usar capa"}</span></button>)}</div> : null}
            <button className="ai-importer-remove" type="button" onClick={() => setDrafts((current) => current.filter((_, position) => position !== index))}>Remover este item</button>
          </div>
        </article>;
      })}</div>
      <footer><p><strong>Rascunho:</strong> fica salvo para edição. <strong>Publicar:</strong> envia o anúncio para o fluxo normal do portal.</p><div><button className="customer-secondary-action" type="button" disabled={Boolean(saving)} onClick={() => void save("draft")}>{saving === "draft" ? "Salvando…" : "Salvar como rascunho"}</button><button className="customer-primary-action" type="button" disabled={Boolean(saving)} onClick={() => void save("publish")}>{saving === "publish" ? "Publicando…" : scope === "store" ? "Publicar na loja" : "Enviar para publicação"}</button></div></footer>
    </div> : null}
    {saved.length ? <div className="ai-importer-saved"><h3>Processamento concluído</h3>{saved.map((item) => <article key={item.id}><span>✓</span><div><strong>{item.title}</strong><small>{item.status === "draft" ? "Rascunho salvo" : scope === "store" ? "Publicado na loja" : "Enviado para aprovação"}</small></div>{scope === "user" ? <a href={`/editar-anuncio/${item.id}`}>Editar anúncio</a> : <a href="/minha-conta/loja">Gerenciar loja</a>}</article>)}</div> : null}
    {storedDrafts.length ? <div className="ai-importer-stored"><header><div><span>Salvos anteriormente</span><h3>Rascunhos do Importador IA</h3></div><b>{storedDrafts.length}</b></header>{storedDrafts.slice(0, 10).map((item) => <article key={item.id}><div><strong>{item.title}</strong><small>Rascunho</small></div>{scope === "user" ? <a href={`/editar-anuncio/${item.id}`}>Editar e publicar</a> : <a href="/minha-conta/loja">Abrir loja</a>}</article>)}</div> : null}
  </section>;
}
