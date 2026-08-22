"use client";
/* eslint-disable @next/next/no-html-link-for-pages */

import { useEffect, useMemo, useState } from "react";
import { CompactCard, PortalFooter, PortalHeader, useImportedListings } from "../shared";

export default function FavoritesPage() {
  const { items, loading } = useImportedListings();
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  useEffect(() => {
    queueMicrotask(() => {
      try { setFavoriteIds(JSON.parse(localStorage.getItem("balcao-favorites") || "[]")); }
      catch { setFavoriteIds([]); }
    });
  }, []);
  const favorites = useMemo(() => {
    const ids = new Set(favoriteIds);
    return items.filter((item) => ids.has(item.id));
  }, [favoriteIds, items]);

  return <main><PortalHeader /><div className="results-shell"><div className="breadcrumbs"><a href="/">Início</a> › Favoritos</div><div className="results-head"><div><span className="hero-kicker">Sua seleção</span><h1>Anúncios favoritos</h1><p>Acesse rapidamente as oportunidades que mais gostou.</p></div></div>{loading ? <p role="status">Carregando seus favoritos…</p> : favorites.length ? <section className="results-grid favorites-page">{favorites.map((item) => <CompactCard item={item} key={item.id} />)}</section> : <div className="empty-state"><span>♡</span><h2>Nenhum anúncio favorito</h2><p>Use o ícone de coração nos anúncios para salvar sua seleção.</p></div>}<div className="cta-banner compact-cta"><div><h2>Continue explorando</h2><p>Novos anúncios são publicados todos os dias.</p></div><a className="primary-button" href="/anuncios">Ver todos os anúncios</a></div></div><PortalFooter /></main>;
}
