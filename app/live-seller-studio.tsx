"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { LiveSessionRecord, LiveSignalRecord } from "../db/live";
import { LiveChat } from "./live-chat";

const hostKey = "host-live";
const rtcConfig: RTCConfiguration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

export function LiveSellerStudio({ storeName }: { storeName: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peers = useRef(new Map<string, RTCPeerConnection>());
  const [session, setSession] = useState<LiveSessionRecord | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => { fetch("/api/live/manage", { cache: "no-store" }).then((response) => response.json()).then((data) => { if (data.session) { setSession(data.session); setNotice("Existe uma sala ativa. Ative a câmera e inicie novamente para retomar a transmissão."); } }).catch(() => undefined); }, []);

  async function activateCamera(selectedId?: string) {
    setNotice("");
    if (!navigator.mediaDevices?.getUserMedia) return setNotice("Este navegador não permite usar câmera e microfone.");
    try {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia({ video: selectedId ? { deviceId: { exact: selectedId } } : { facingMode: { ideal: "environment" } }, audio: true });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraReady(true);
      const available = (await navigator.mediaDevices.enumerateDevices()).filter((item) => item.kind === "videoinput");
      setDevices(available);
      const currentId = stream.getVideoTracks()[0]?.getSettings().deviceId || selectedId || "";
      setDeviceId(currentId);
      for (const peer of peers.current.values()) {
        for (const track of stream.getTracks()) {
          const sender = peer.getSenders().find((item) => item.track?.kind === track.kind);
          if (sender) await sender.replaceTrack(track);
        }
      }
    } catch { setCameraReady(false); setNotice("Autorize o acesso à câmera e ao microfone para transmitir."); }
  }

  async function sendSignal(sessionId: string, recipientKey: string, kind: "answer" | "ice", payload: unknown) {
    await fetch(`/api/live/${encodeURIComponent(sessionId)}/signals`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senderKey: hostKey, recipientKey, kind, payload }) });
  }

  function beginSignaling(liveSession: LiveSessionRecord) {
    let after = 0;
    let active = true;
    const pendingIce = new Map<string, RTCIceCandidateInit[]>();
    async function createPeer(viewerKey: string) {
      const previous = peers.current.get(viewerKey); previous?.close();
      const peer = new RTCPeerConnection(rtcConfig);
      peers.current.set(viewerKey, peer);
      streamRef.current?.getTracks().forEach((track) => peer.addTrack(track, streamRef.current!));
      peer.onicecandidate = (event) => { if (event.candidate) void sendSignal(liveSession.id, viewerKey, "ice", event.candidate.toJSON()); };
      peer.onconnectionstatechange = () => { if (["failed", "closed"].includes(peer.connectionState)) { peer.close(); peers.current.delete(viewerKey); } };
      return peer;
    }
    async function poll() {
      try {
        const response = await fetch(`/api/live/${encodeURIComponent(liveSession.id)}/signals?recipient=${hostKey}&after=${after}`, { cache: "no-store" });
        const data = await response.json() as { signals?: LiveSignalRecord[] };
        if (!active || !response.ok) return;
        for (const item of data.signals || []) {
          after = Math.max(after, item.id);
          const payload = JSON.parse(item.payload);
          if (item.kind === "offer") {
            const peer = await createPeer(item.senderKey);
            await peer.setRemoteDescription(payload);
            for (const candidate of pendingIce.get(item.senderKey) || []) await peer.addIceCandidate(candidate).catch(() => undefined);
            pendingIce.delete(item.senderKey);
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            await sendSignal(liveSession.id, item.senderKey, "answer", answer);
          } else if (item.kind === "ice") {
            const peer = peers.current.get(item.senderKey);
            if (peer?.remoteDescription) await peer.addIceCandidate(payload).catch(() => undefined);
            else pendingIce.set(item.senderKey, [...(pendingIce.get(item.senderKey) || []), payload]);
          }
        }
      } catch { /* a próxima consulta tenta novamente */ }
    }
    void poll();
    const timer = window.setInterval(poll, 800);
    return () => { active = false; window.clearInterval(timer); };
  }

  useEffect(() => {
    if (!session || !cameraReady) return;
    const stopPolling = beginSignaling(session);
    return stopPolling;
  // beginSignaling depende somente da sala e da câmera já iniciada.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, cameraReady]);

  useEffect(() => {
    if (!session || !cameraReady) return;
    const heartbeat = () => fetch("/api/live/manage", { method: "PATCH", keepalive: true }).catch(() => undefined);
    void heartbeat();
    const timer = window.setInterval(heartbeat, 20_000);
    return () => window.clearInterval(timer);
  }, [session, cameraReady]);

  useEffect(() => () => { streamRef.current?.getTracks().forEach((track) => track.stop()); peers.current.forEach((peer) => peer.close()); }, []);

  async function startBroadcast(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cameraReady) return setNotice("Ative a câmera antes de iniciar.");
    setBusy(true); setNotice("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/live/manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: data.get("title"), description: data.get("description") }) });
      const result = await response.json() as { session?: LiveSessionRecord; error?: string };
      if (!response.ok || !result.session) return setNotice(result.error || "Não foi possível iniciar.");
      peers.current.forEach((peer) => peer.close()); peers.current.clear();
      setSession(result.session); setNotice("Transmissão iniciada. Compartilhe o link público.");
    } catch { setNotice("Conexão indisponível. Tente novamente."); }
    finally { setBusy(false); }
  }

  async function stopBroadcast() {
    if (!session) return;
    setBusy(true);
    await fetch(`/api/live/manage?id=${encodeURIComponent(session.id)}`, { method: "DELETE" }).catch(() => undefined);
    peers.current.forEach((peer) => peer.close()); peers.current.clear();
    setSession(null); setNotice("Transmissão encerrada."); setBusy(false);
  }

  return <>
    <div className="customer-page-heading"><div><span>Loja virtual</span><h1>Anúncio ao vivo</h1><p>Apresente produtos pela câmera do celular e responda visitantes em tempo real.</p></div>{session ? <a className="customer-period" href={`/ao-vivo/${session.id}`} target="_blank" rel="noreferrer">Abrir sala pública ↗</a> : null}</div>
    <section className="live-studio customer-panel">
      <div className="live-studio-preview">
        <div className="live-video-stage"><video ref={videoRef} autoPlay muted playsInline /><div className="live-video-status"><span className={session ? "live-dot" : ""} />{session ? "TRANSMITINDO" : cameraReady ? "PRÉ-VISUALIZAÇÃO" : "CÂMERA DESATIVADA"}</div></div>
        <div className="live-camera-actions">
          <button type="button" onClick={() => void activateCamera(deviceId)}>{cameraReady ? "Reativar câmera" : "Ativar câmera e microfone"}</button>
          {devices.length > 1 ? <label><span>Escolher câmera</span><select value={deviceId} onChange={(event) => { setDeviceId(event.target.value); void activateCamera(event.target.value); }}>{devices.map((item, index) => <option value={item.deviceId} key={item.deviceId}>{item.label || `Câmera ${index + 1}`}</option>)}</select></label> : null}
        </div>
      </div>
      <form className="live-studio-form" onSubmit={startBroadcast}>
        <span>Configuração da live</span><h2>O que você vai apresentar?</h2>
        <label><span>Título</span><input name="title" defaultValue={session?.title || "Ofertas ao vivo da nossa loja"} maxLength={100} required /></label>
        <label><span>Descrição</span><textarea name="description" defaultValue={session?.description || "Acompanhe a apresentação e tire suas dúvidas pelo chat."} maxLength={500} /></label>
        <div className="live-studio-tip"><strong>Antes de começar</strong><p>Use uma conexão estável, mantenha o celular na horizontal e permita câmera e microfone quando o navegador solicitar.</p></div>
        {notice ? <p className="live-studio-notice" role="status">{notice}</p> : null}
        {session ? <button className="live-stop-button" type="button" onClick={stopBroadcast} disabled={busy}>Encerrar transmissão</button> : <button className="customer-primary-action" type="submit" disabled={busy || !cameraReady}>{busy ? "Iniciando…" : "Iniciar transmissão"}</button>}
      </form>
    </section>
    {session ? <div className="live-owner-chat"><LiveChat sessionId={session.id} ownerMode ownerName={storeName} /></div> : null}
  </>;
}
