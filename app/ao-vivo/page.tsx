import type { Metadata } from "next";
/* eslint-disable @next/next/no-img-element */
import { listActiveLiveSessions } from "../../db/live";
import { PortalFooter, PortalHeader } from "../shared";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Anúncios ao vivo | Balcão", description: "Assista às apresentações ao vivo das lojas virtuais e converse com os anunciantes." };

export default async function LiveDirectoryPage() {
  const active = await listActiveLiveSessions();
  return <><PortalHeader /><main className="live-directory-shell">
    <header className="live-directory-heading"><div><span><i className="live-dot" /> Agora no Balcão</span><h1>Anúncios ao vivo</h1><p>Conheça os produtos em vídeo e converse diretamente com o anunciante pelo chat.</p></div><a href="/lojista">Quero transmitir</a></header>
    {active.length ? <section><div className="live-section-title"><h2>Transmitindo agora</h2><span>{active.length} sala(s)</span></div><div className="live-grid">{active.map((item) => <a className="live-card" href={`/ao-vivo/${item.id}`} key={item.id}><div className="live-card-media">{item.storeLogo ? <img src={item.storeLogo} alt="" /> : <span>{item.storeName?.slice(0, 2).toUpperCase()}</span>}<em><i className="live-dot" /> AO VIVO</em></div><div><small>{item.storeName}</small><h2>{item.title}</h2><p>{item.description}</p><b>Assistir e conversar →</b></div></a>)}</div></section> : <div className="live-empty-now"><span>◉</span><div><strong>Nenhuma loja transmitindo neste momento</strong><p>Quando um lojista iniciar uma transmissão, ela aparecerá aqui automaticamente.</p></div></div>}
  </main><PortalFooter /></>;
}
