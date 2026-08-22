import { notFound } from "next/navigation";
import Link from "next/link";
import { getPublicLiveSession } from "../../../db/live";
import { LiveRoomClient } from "../../live-room-client";
import { PortalFooter, PortalHeader } from "../../shared";

export const dynamic = "force-dynamic";

export default async function LiveRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getPublicLiveSession(id);
  if (!session || session.status !== "live") notFound();
  const title = session.title;
  const description = session.description;
  const storeName = session.storeName || "Loja Balcão";
  return <><PortalHeader /><main className="live-room-shell">
    <nav aria-label="Navegação estrutural"><Link href="/">Início</Link><span>›</span><Link href="/ao-vivo">Ao vivo</Link><span>›</span><b>{storeName}</b></nav>
    <header className="live-room-heading"><div><span><i className="live-dot" /> AO VIVO</span><h1>{title}</h1><p>{description}</p></div><aside><small>Apresentado por</small><strong>{storeName}</strong>{session.storeSlug ? <a href={`/loja/${session.storeSlug}`}>Visitar loja →</a> : null}</aside></header>
    <LiveRoomClient sessionId={id} />
  </main><PortalFooter /></>;
}
