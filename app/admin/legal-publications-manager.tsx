"use client";
/* eslint-disable @next/next/no-img-element */

import { FormEvent, useCallback, useEffect, useState } from "react";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

type LegalPublication = {
  id: string;
  source: "manual" | "wordpress";
  title: string;
  body: string;
  filename: string;
  pdfUrl: string;
  pdfKey: string | null;
  originalPdfUrl: string | null;
  images: string[];
  sourcePostUrl: string | null;
  publishedAt: string;
};

type ApiPayload = {
  error?: string;
  publication?: LegalPublication | null;
  publications?: LegalPublication[];
  sourceUrl?: string;
  detected?: number;
  imported?: number;
  updated?: number;
};

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Não foi possível gerar a imagem da página.")), "image/webp", 0.84);
  });
}

function publicationDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data não informada" : date.toLocaleDateString("pt-BR");
}

export default function LegalPublicationsManager() {
  const [publications, setPublications] = useState<LegalPublication[]>([]);
  const [sourceUrl, setSourceUrl] = useState("https://jornalbalcao.com.br/publicidadelegal");
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/legal-publications", { cache: "no-store" });
    const data = await response.json().catch(() => ({})) as ApiPayload;
    if (!response.ok) throw new Error(data.error || "Não foi possível carregar as publicações legais.");
    setPublications(Array.isArray(data.publications) ? data.publications : []);
    if (data.sourceUrl) setSourceUrl(data.sourceUrl);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load().catch((error) => setStatus(error instanceof Error ? error.message : "Não foi possível carregar as publicações legais."));
    });
  }, [load]);

  async function uploadPreview(id: string, pageIndex: number, blob: Blob) {
    const form = new FormData();
    form.set("id", id);
    form.set("pageIndex", String(pageIndex));
    form.set("file", new File([blob], `pagina-${pageIndex + 1}.webp`, { type: blob.type || "image/webp" }));
    const response = await fetch("/api/admin/legal-publications/preview", { method: "POST", body: form });
    const data = await response.json().catch(() => ({})) as ApiPayload;
    if (!response.ok || !data.publication) throw new Error(data.error || "Não foi possível salvar uma imagem do PDF.");
    setPublications((current) => current.map((item) => item.id === id ? data.publication as LegalPublication : item));
    return data.publication;
  }

  async function renderPdfImages(publication: LegalPublication) {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    const response = await fetch(publication.pdfUrl, { cache: "no-store" });
    if (!response.ok) throw new Error("Não foi possível abrir o PDF armazenado.");
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await response.arrayBuffer()) });
    const pdfDocument = await loadingTask.promise;
    try {
      const pageCount = Math.min(pdfDocument.numPages, 12);
      for (let index = 0; index < pageCount; index += 1) {
        setStatus(`Gerando imagem ${index + 1} de ${pageCount}: ${publication.title}`);
        const page = await pdfDocument.getPage(index + 1);
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(2, Math.max(1.2, 1400 / Math.max(baseViewport.width, 1)));
        const viewport = page.getViewport({ scale });
        const canvas = window.document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, viewport, background: "#ffffff" }).promise;
        await uploadPreview(publication.id, index, await canvasBlob(canvas));
        canvas.width = 1;
        canvas.height = 1;
        page.cleanup();
      }
    } finally {
      await pdfDocument.cleanup();
      await loadingTask.destroy();
    }
  }

  async function archivePublication(publication: LegalPublication) {
    if (publication.pdfKey) return publication;
    setStatus(`Importando o PDF: ${publication.title}`);
    const response = await fetch("/api/admin/legal-publications/archive", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: publication.id }),
    });
    const data = await response.json().catch(() => ({})) as ApiPayload;
    if (!response.ok || !data.publication) throw new Error(data.error || "Não foi possível importar o PDF.");
    setPublications((current) => current.map((item) => item.id === publication.id ? data.publication as LegalPublication : item));
    return data.publication;
  }

  async function preparePublication(publication: LegalPublication) {
    const archived = await archivePublication(publication);
    await renderPdfImages(archived);
  }

  async function importWordpress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setStatus("Lendo o JSON do WordPress e identificando os editais…");
    setProgress({ current: 0, total: 0 });
    try {
      const response = await fetch("/api/admin/legal-publications/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceUrl }),
      });
      const data = await response.json().catch(() => ({})) as ApiPayload;
      if (!response.ok) throw new Error(data.error || "Não foi possível importar o JSON do WordPress.");
      const importedPublications = Array.isArray(data.publications) ? data.publications : [];
      setPublications(importedPublications);
      const queue = importedPublications.filter((item) => item.source === "wordpress" && (!item.pdfKey || !item.images.length));
      setProgress({ current: 0, total: queue.length });
      let failures = 0;
      for (let index = 0; index < queue.length; index += 1) {
        const item = queue[index];
        setBusyId(item.id);
        try {
          await preparePublication(item);
        } catch {
          failures += 1;
        }
        setProgress({ current: index + 1, total: queue.length });
      }
      await load();
      const summary = `${data.detected || importedPublications.length} editais localizados; ${data.imported || 0} novos e ${data.updated || 0} atualizados.`;
      setStatus(failures ? `${summary} ${failures} PDFs exigem uma nova tentativa.` : `${summary} PDFs e imagens gerados corretamente.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível concluir a importação.");
    } finally {
      setBusy(false);
      setBusyId("");
    }
  }

  async function addManualPublication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const formElement = event.currentTarget;
    setBusy(true);
    setStatus("Enviando o PDF e criando a publicação…");
    try {
      const form = new FormData(formElement);
      const response = await fetch("/api/admin/legal-publications", { method: "POST", body: form });
      const data = await response.json().catch(() => ({})) as ApiPayload;
      if (!response.ok || !data.publication) throw new Error(data.error || "Não foi possível criar a publicação legal.");
      setBusyId(data.publication.id);
      setPublications((current) => [data.publication as LegalPublication, ...current]);
      await renderPdfImages(data.publication);
      formElement.reset();
      await load();
      setStatus("Publicação criada. O PDF e as imagens das páginas já estão disponíveis na lista pública.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível criar a publicação legal.");
    } finally {
      setBusy(false);
      setBusyId("");
    }
  }

  async function retryPublication(publication: LegalPublication) {
    if (busy) return;
    setBusy(true);
    setBusyId(publication.id);
    try {
      await preparePublication(publication);
      await load();
      setStatus("PDF arquivado e imagens das páginas geradas corretamente.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível processar este PDF.");
    } finally {
      setBusy(false);
      setBusyId("");
    }
  }

  return (
    <section className="admin-section legal-admin">
      <div className="admin-section-head">
        <div><span className="hero-kicker">Documentos oficiais</span><h1>Publicidade Legal</h1><p>Importe os editais do WordPress ou publique um novo PDF. O sistema converte automaticamente até 12 páginas de cada documento em imagens.</p></div>
        <a className="soft-button" href="/publicidade-legal" target="_blank" rel="noreferrer">Ver página pública ↗</a>
      </div>

      <div className="legal-admin-actions">
        <form className="panel-card admin-form legal-import-form" onSubmit={importWordpress}>
          <span className="legal-admin-icon" aria-hidden="true">↻</span>
          <h2>Importar do WordPress</h2>
          <p>O sistema lê o JSON, identifica os PDFs dos editais, arquiva os documentos e gera as imagens das páginas.</p>
          <label>URL do site ou endpoint JSON<input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://jornalbalcao.com.br/publicidadelegal" required /></label>
          <button className="primary-button" disabled={busy}>{busy && progress.total ? `Processando ${progress.current}/${progress.total}` : "Importar publicações existentes"}</button>
          {progress.total ? <div className="legal-import-progress"><span style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }} /></div> : null}
        </form>

        <form className="panel-card admin-form legal-create-form" onSubmit={addManualPublication}>
          <span className="legal-admin-icon" aria-hidden="true">＋</span>
          <h2>Adicionar publicidade legal</h2>
          <label>Nome da publicação<input name="title" minLength={3} maxLength={220} placeholder="Ex.: Editais 25/08/2026" required /></label>
          <label>Texto e informações<textarea name="body" rows={5} maxLength={20000} placeholder="Órgão, objeto, número do processo e outras informações do edital" /></label>
          <div className="legal-create-row"><label>Data da publicação<input name="publishedAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label><label>Arquivo PDF<input name="file" type="file" accept="application/pdf,.pdf" required /></label></div>
          <button className="primary-button" disabled={busy}>Adicionar e gerar imagens</button>
        </form>
      </div>

      {status ? <p className="integration-status legal-admin-status" role="status">{status}</p> : null}

      <section className="panel-card legal-admin-list">
        <header><div><h2>Publicações cadastradas</h2><small>{publications.length} documentos disponíveis no painel</small></div><button type="button" className="soft-button" onClick={() => void load()} disabled={busy}>Atualizar lista</button></header>
        <div>
          {publications.map((item) => (
            <article key={item.id}>
              <a href={item.pdfUrl} target="_blank" rel="noreferrer" className="legal-admin-preview">
                {item.images[0] ? <img src={item.images[0]} alt="" /> : <span>PDF</span>}
              </a>
              <div><b>{item.title}</b><span>{publicationDate(item.publishedAt)} · {item.source === "wordpress" ? "WordPress" : "Cadastro manual"}</span><small>{item.filename}</small></div>
              <em className={item.pdfKey && item.images.length ? "ready" : "pending"}>{item.pdfKey && item.images.length ? `${item.images.length} imagem${item.images.length === 1 ? "" : "s"}` : "Processamento pendente"}</em>
              <a href={item.pdfUrl} target="_blank" rel="noreferrer">Abrir PDF ↗</a>
              {item.pdfKey && item.images.length ? null : <button type="button" onClick={() => void retryPublication(item)} disabled={busy}>{busyId === item.id ? "Processando…" : "Gerar imagens"}</button>}
            </article>
          ))}
          {!publications.length ? <p>Nenhuma publicação legal cadastrada.</p> : null}
        </div>
      </section>
    </section>
  );
}
