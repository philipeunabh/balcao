import type { Metadata } from "next";
/* eslint-disable @next/next/no-img-element */
import { listLegalPublications } from "../../db/legal-publications";
import { MiniLogo, PortalFooter, PortalHeader } from "../shared";

export const metadata: Metadata = {
  title: "Publicidade Legal — Editais e documentos oficiais",
  description: "Consulte os editais e documentos de publicidade legal publicados pelo Jornal Balcão.",
  alternates: { canonical: "/publicidade-legal" },
};
export const revalidate = 60;

const PAGE_SIZE = 12;

function pageHref(page: number, query: string) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page > 1) params.set("pagina", String(page));
  const suffix = params.toString();
  return `/publicidade-legal${suffix ? `?${suffix}` : ""}`;
}

function formatDate(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date(timestamp))
    : "Data não informada";
}

export default async function LegalPublicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; pagina?: string }>;
}) {
  const params = await searchParams;
  const query = (params.q || "").trim().slice(0, 120);
  const requestedPage = Math.max(Number.parseInt(params.pagina || "1", 10) || 1, 1);
  const result = await listLegalPublications({ query, limit: PAGE_SIZE, offset: (requestedPage - 1) * PAGE_SIZE })
    .catch(() => ({ items: [], total: 0 }));
  const pageCount = Math.max(Math.ceil(result.total / PAGE_SIZE), 1);
  const page = Math.min(requestedPage, pageCount);

  return (
    <>
      <PortalHeader />
      <main className="legal-publications-page">
        <section className="legal-hero" aria-labelledby="legal-title">
          <div className="legal-hero-brand"><MiniLogo /></div>
          <span className="legal-kicker">Publicidade Legal</span>
          <h1 id="legal-title">Publique seu Edital com Credibilidade e Alcance!</h1>
          <p>Jornal Balcão News: a escolha certa para transparência, visibilidade e credibilidade.</p>
          <a className="legal-phone" href="tel:+553133309600">Para anunciar ligue <strong>(31) 3330-9600</strong></a>
          <a
            className="legal-whatsapp"
            href="https://wa.me/553133309600?text=Ol%C3%A1%2C%20gostaria%20de%20solicitar%20um%20or%C3%A7amento%20para%20publicidade%20legal."
            target="_blank"
            rel="noreferrer"
          >
            <span aria-hidden="true">◉</span> Solicitar Orçamento
          </a>
        </section>

        <section className="legal-benefits" aria-labelledby="legal-benefits-title">
          <h2 id="legal-benefits-title">Por que publicar no Jornal Balcão News?</h2>
          <div>
            <article><span aria-hidden="true">✓</span><div><strong>Publicação rápida e segura</strong><p>Fluxo organizado para publicar seu edital com agilidade e conformidade.</p></div></article>
            <article><span aria-hidden="true">✓</span><div><strong>30 anos de credibilidade</strong><p>Tradição editorial e presença consolidada em Minas Gerais.</p></div></article>
            <article><span aria-hidden="true">✓</span><div><strong>Assinatura digital e QR Code</strong><p>Documentos preparados para validação, consulta e compartilhamento digital.</p></div></article>
            <article><span aria-hidden="true">✓</span><div><strong>Opção digital e impressa</strong><p>Publicação adequada às necessidades legais de empresas e instituições.</p></div></article>
          </div>
        </section>

        <section className="legal-cta">
          <span aria-hidden="true">◆</span>
          <div><h2>Faça sua publicação legal agora mesmo!</h2><p>Jornal Balcão News: a escolha certa para transparência, visibilidade e credibilidade.</p></div>
          <a href="https://wa.me/553133309600?text=Ol%C3%A1%2C%20quero%20publicar%20um%20edital." target="_blank" rel="noreferrer">Publicar edital</a>
        </section>

        <section className="legal-library" aria-labelledby="legal-library-title">
          <header>
            <div><span>Documentos publicados</span><h2 id="legal-library-title">Últimos editais de publicidade legal</h2><p>{result.total} {result.total === 1 ? "publicação localizada" : "publicações localizadas"}</p></div>
            <form action="/publicidade-legal" role="search">
              <label htmlFor="legal-search">Pesquisar editais</label>
              <div><input id="legal-search" name="q" defaultValue={query} placeholder="Nome, órgão ou conteúdo do edital" /><button type="submit" aria-label="Pesquisar">⌕</button></div>
            </form>
          </header>

          {result.items.length ? (
            <div className="legal-publication-list">
              {result.items.map((item) => (
                <article key={item.id}>
                  <a className="legal-document-preview" href={item.pdfUrl} target="_blank" rel="noreferrer" aria-label={`Abrir PDF: ${item.title}`}>
                    {item.images[0]
                      ? <img src={item.images[0]} alt={`Primeira página de ${item.title}`} loading="lazy" decoding="async" />
                      : <span><b>PDF</b><small>Documento oficial</small></span>}
                    {item.images.length > 1 ? <em>{item.images.length} páginas</em> : null}
                  </a>
                  <div className="legal-document-copy">
                    <div className="legal-document-meta"><span>{item.source === "wordpress" ? "Edital importado" : "Publicação do Balcão"}</span><time dateTime={item.publishedAt}>{formatDate(item.publishedAt)}</time></div>
                    <h3>{item.title}</h3>
                    {item.body ? <p>{item.body}</p> : <p>Arquivo de publicidade legal disponível para consulta.</p>}
                    <div className="legal-document-actions">
                      <a className="legal-open-pdf" href={item.pdfUrl} target="_blank" rel="noreferrer">Visualizar edital em PDF ↗</a>
                      {item.sourcePostUrl ? <a href={item.sourcePostUrl} target="_blank" rel="noreferrer">Ver publicação original</a> : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="legal-empty"><span>PDF</span><h3>{query ? "Nenhum edital encontrado" : "Nenhum edital publicado"}</h3><p>{query ? "Revise o termo pesquisado e tente novamente." : "Os documentos cadastrados e importados aparecerão nesta lista."}</p></div>
          )}

          {pageCount > 1 ? (
            <nav className="legal-pagination" aria-label="Paginação dos editais">
              {page > 1 ? <a href={pageHref(page - 1, query)}>← Anterior</a> : <span />}
              <strong>Página {page} de {pageCount}</strong>
              {page < pageCount ? <a href={pageHref(page + 1, query)}>Próxima →</a> : <span />}
            </nav>
          ) : null}
        </section>
      </main>
      <PortalFooter />
    </>
  );
}
