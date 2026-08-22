"use client";
/* eslint-disable @next/next/no-img-element */

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { defaultDiscoverPages, DiscoverPage } from "../../discover-data";
import { PortalFooter, PortalHeader } from "../../shared";

export default function DiscoverDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [pages, setPages] = useState<DiscoverPage[]>(defaultDiscoverPages);
  useEffect(() => {
    fetch("/api/settings").then((response) => response.json()).then((data) => {
      if (Array.isArray(data.discover_pages) && data.discover_pages.length) setPages(data.discover_pages);
    }).catch(() => undefined);
  }, []);
  const page = pages.find((item) => item.slug === slug && item.active);
  return <main>
    <PortalHeader />
    {page ? <article className="discover-detail page-shell">
      <img src={page.image} alt="" fetchPriority="high" decoding="async" />
      <div><span className="hero-kicker">Descubra</span><h1>{page.title}</h1><p className="discover-lead">{page.summary}</p>{page.content.split(/\n\n+/).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
    </article> : <div className="detail-data-status">Página não encontrada.</div>}
    <PortalFooter />
  </main>;
}
