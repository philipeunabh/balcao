"use client";

import { useEffect, useRef, useState } from "react";
import { LiveChat } from "./live-chat";

type Signal = { id: number; senderKey: string; kind: "answer" | "ice"; payload: string };
const rtcConfig: RTCConfiguration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

export function LiveRoomClient({ sessionId, modelVideoUrl, poster }: { sessionId: string; modelVideoUrl?: string; poster?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState(modelVideoUrl ? "Demonstração em vídeo" : "Conectando à transmissão…");
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    if (modelVideoUrl) return;
    const peerKey = crypto.randomUUID();
    const peer = new RTCPeerConnection(rtcConfig);
    let active = true;
    let after = 0;
    const pendingIce: RTCIceCandidateInit[] = [];
    peer.addTransceiver("video", { direction: "recvonly" });
    peer.addTransceiver("audio", { direction: "recvonly" });
    peer.ontrack = (event) => {
      if (videoRef.current) {
        videoRef.current.srcObject = event.streams[0] || new MediaStream([event.track]);
        void videoRef.current.play().catch(() => undefined);
      }
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") setStatus("AO VIVO");
      if (["failed", "disconnected"].includes(peer.connectionState)) setStatus("Reconectando…");
    };
    async function signal(kind: "offer" | "ice", payload: unknown) {
      await fetch(`/api/live/${encodeURIComponent(sessionId)}/signals`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senderKey: peerKey, recipientKey: "host-live", kind, payload }) });
    }
    peer.onicecandidate = (event) => { if (event.candidate) void signal("ice", event.candidate.toJSON()); };
    async function start() {
      try {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        await signal("offer", offer);
      } catch { setStatus("Não foi possível conectar."); }
    }
    async function poll() {
      try {
        const response = await fetch(`/api/live/${encodeURIComponent(sessionId)}/signals?recipient=${peerKey}&after=${after}`, { cache: "no-store" });
        const data = await response.json() as { signals?: Signal[] };
        if (!active || !response.ok) return;
        for (const item of data.signals || []) {
          after = Math.max(after, item.id);
          const payload = JSON.parse(item.payload);
          if (item.kind === "answer" && !peer.currentRemoteDescription) {
            await peer.setRemoteDescription(payload);
            while (pendingIce.length) await peer.addIceCandidate(pendingIce.shift()!).catch(() => undefined);
          }
          if (item.kind === "ice") {
            if (peer.remoteDescription) await peer.addIceCandidate(payload).catch(() => undefined);
            else pendingIce.push(payload);
          }
        }
      } catch { /* a próxima consulta tenta novamente */ }
    }
    void start(); void poll();
    const timer = window.setInterval(poll, 900);
    return () => { active = false; window.clearInterval(timer); peer.close(); };
  }, [modelVideoUrl, sessionId]);

  function toggleSound() {
    setMuted((current) => !current);
    if (videoRef.current) void videoRef.current.play().catch(() => undefined);
  }

  return <div className="live-room-grid live-room-stacked">
    <section className="live-video-stage">
      <div className="live-video-status"><span className="live-dot" />{status}</div>
      {modelVideoUrl
        ? <video src={modelVideoUrl} poster={poster} autoPlay muted loop playsInline controls />
        : <><video ref={videoRef} autoPlay muted={muted} playsInline controls /><button className="live-sound-button" type="button" onClick={toggleSound}>{muted ? "Ativar som" : "Desativar som"}</button></>}
      <p>{modelVideoUrl ? "Exemplo de como a transmissão do lojista aparece para os visitantes." : "Transmissão em tempo real pelo navegador da loja."}</p>
    </section>
    <div className="live-chat-below"><LiveChat sessionId={sessionId} /></div>
  </div>;
}
