"use client";
/* eslint-disable @next/next/no-img-element, @next/next/no-html-link-for-pages */

import { FormEvent, useEffect, useMemo, useState } from "react";
import { portalCategories } from "../../categories";
import { MapPlaceSearch } from "../../google-place-search";
import { PortalHeader } from "../../shared";

type EditRecord = {
  id: string; title: string; description: string; negotiationType: string; category: string; subcategory: string;
  priceCents: number | null; monthlyRentCents: number | null; iptuCents: number | null; condoCents: number | null;
  negotiable: number; address: string; latitude: string | null; longitude: string | null; displayName: string; whatsapp: string;
  attributes: Record<string, string | number | boolean>; features: string[]; images: string[]; status: string;
};

const featureOptions = ["Novo", "Usado", "Com garantia", "Aceita troca", "Entrega disponível", "Piscina", "Garagem", "Elevador", "Ar-condicionado", "Único dono", "Atendimento online"];
const negotiations = ["Compra", "Venda", "Troca", "Aluguel", "Temporada", "Serviço", "Outra"];
const showMoney = (value: number | null) => value == null ? "" : (value / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyCents = (value: string) => { const digits = value.replace(/\D/g, ""); return digits ? Number(digits) : null; };
const moneyMask = (value: string) => { const digits = value.replace(/\D/g, ""); return digits ? (Number(digits) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""; };

export default function EditListingClient({ id }: { id: string }) {
  const [listing, setListing] = useState<EditRecord | null>(null);
  const [category, setCategory] = useState(""); const [subcategory, setSubcategory] = useState("");
  const [negotiation, setNegotiation] = useState("Venda"); const [images, setImages] = useState<string[]>([]);
  const [features, setFeatures] = useState<string[]>([]); const [address, setAddress] = useState("");
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [price, setPrice] = useState(""); const [rent, setRent] = useState(""); const [iptu, setIptu] = useState(""); const [condo, setCondo] = useState("");
  const [negotiable, setNegotiable] = useState(false); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("Carregando anúncio…");
  const selectedCategory = useMemo(() => portalCategories.find((item) => item.name === category), [category]);

  useEffect(() => {
    fetch(`/api/customer/listings/${encodeURIComponent(id)}`, { cache: "no-store" }).then(async (response) => {
      const data = await response.json() as { listing?: EditRecord; error?: string };
      if (!response.ok || !data.listing) throw new Error(data.error || "Não foi possível carregar o anúncio.");
      const item = data.listing; setListing(item); setCategory(item.category); setSubcategory(item.subcategory); setNegotiation(item.negotiationType);
      setImages(item.images || []); setFeatures(item.features || []); setAddress(item.address); setCoordinates(item.latitude && item.longitude ? { lat: Number(item.latitude), lng: Number(item.longitude) } : null);
      setPrice(showMoney(item.priceCents)); setRent(showMoney(item.monthlyRentCents)); setIptu(showMoney(item.iptuCents)); setCondo(showMoney(item.condoCents)); setNegotiable(Boolean(item.negotiable)); setMessage("");
    }).catch((error) => setMessage(error instanceof Error ? error.message : "Não foi possível carregar o anúncio."));
  }, [id]);

  async function uploadFiles(files: FileList | null) {
    const selected = Array.from(files || []).slice(0, Math.max(0, 12 - images.length)); if (!selected.length) return;
    setBusy(true); setMessage("Enviando fotos…");
    try {
      const uploaded: string[] = [];
      for (const file of selected) {
        const body = new FormData(); body.set("file", file);
        const response = await fetch("/api/listing-images", { method: "POST", body }); const data = await response.json() as { url?: string; error?: string };
        if (!response.ok || !data.url) throw new Error(data.error || "Falha ao enviar a imagem."); uploaded.push(data.url);
      }
      setImages((current) => [...current, ...uploaded].slice(0, 12)); setMessage("Fotos carregadas. Salve as alterações para concluir.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao enviar as fotos."); }
    finally { setBusy(false); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!listing) return; setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/customer/listings/${encodeURIComponent(id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      title: form.get("title"), description: form.get("description"), negotiationType: negotiation, category, subcategory,
      priceCents: negotiable ? null : moneyCents(price), monthlyRentCents: negotiable ? null : moneyCents(rent), iptuCents: moneyCents(iptu), condoCents: moneyCents(condo), negotiable,
      address, latitude: coordinates?.lat ?? null, longitude: coordinates?.lng ?? null, displayName: form.get("displayName"), whatsapp: form.get("whatsapp"),
      attributes: { ...(listing.attributes || {}), videoUrl: String(form.get("videoUrl") || "").trim() }, features, images,
    }) });
    const data = await response.json() as { error?: string; message?: string };
    setMessage(data.message || data.error || (response.ok ? "Anúncio salvo." : "Não foi possível salvar.")); setBusy(false);
    if (response.ok) window.setTimeout(() => window.location.assign("/minha-conta/anuncios"), 1400);
  }

  if (!listing) return <main><PortalHeader /><section className="edit-listing-shell"><p role="status">{message}</p></section></main>;
  return <main><PortalHeader /><section className="edit-listing-shell"><header><span>Meus anúncios</span><h1>Editar anúncio</h1><p>Qualquer alteração envia o anúncio novamente para aprovação. Sem mudanças, ele permanece publicado.</p></header><form className="single-listing-form" onSubmit={save}>
    <section className="listing-section"><h2>Fotos do anúncio</h2><div className="listing-photo-grid">{images.map((image, index) => <article key={image}><img src={image} alt={`Foto ${index + 1}`} />{index === 0 ? <em>Foto de destaque</em> : <button type="button" onClick={() => setImages([image, ...images.filter((item) => item !== image)])}>Definir destaque</button>}<button className="photo-remove" type="button" onClick={() => setImages(images.filter((item) => item !== image))}>×</button></article>)}</div><label className="listing-photo-upload">＋<strong>Adicionar fotos</strong><span>{images.length}/12 imagens</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || images.length >= 12} onChange={(event) => void uploadFiles(event.target.files)} /></label></section>
    <section className="listing-section"><h2>Categoria e transação</h2><div className="listing-fields three"><label>Transação<select value={negotiation} onChange={(event) => setNegotiation(event.target.value)}>{negotiations.map((item) => <option key={item}>{item}</option>)}</select></label><label>Categoria<select value={category} onChange={(event) => { setCategory(event.target.value); setSubcategory(""); }}><option value="">Selecione</option>{portalCategories.map((item) => <option key={item.name}>{item.name}</option>)}</select></label><label>Subcategoria<select value={subcategory} onChange={(event) => setSubcategory(event.target.value)}><option value="">Selecione</option>{selectedCategory?.subs.map((item) => <option key={item}>{item}</option>)}</select></label></div></section>
    <section className="listing-section"><h2>Conteúdo e preço</h2><div className="listing-fields two"><label className="full">Título<input name="title" defaultValue={listing.title} minLength={8} maxLength={120} required /></label><label className="full">Descrição<textarea name="description" defaultValue={listing.description} minLength={30} maxLength={5000} rows={8} required /></label><label className="full">Link do vídeo (opcional)<input name="videoUrl" type="url" inputMode="url" maxLength={500} defaultValue={typeof listing.attributes?.videoUrl === "string" ? listing.attributes.videoUrl : ""} placeholder="https://www.youtube.com/watch?v=... ou https://site.com/video.mp4" /><small>Compatível com YouTube, Vimeo e arquivos MP4/WebM por HTTPS.</small></label>{negotiation === "Aluguel" ? <><label>Aluguel mensal<input value={rent} onChange={(event) => setRent(moneyMask(event.target.value))} /></label><label>IPTU<input value={iptu} onChange={(event) => setIptu(moneyMask(event.target.value))} /></label><label>Condomínio<input value={condo} onChange={(event) => setCondo(moneyMask(event.target.value))} /></label></> : <label>Preço<input value={price} onChange={(event) => setPrice(moneyMask(event.target.value))} /></label>}<label className="check full"><input type="checkbox" checked={negotiable} onChange={(event) => setNegotiable(event.target.checked)} />Valor a combinar</label></div></section>
    <section className="listing-section"><h2>Diferenciais</h2><div className="listing-feature-grid">{[...new Set([...featureOptions, ...features])].map((item) => <label key={item}><input type="checkbox" checked={features.includes(item)} onChange={() => setFeatures((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item])} />{item}</label>)}</div></section>
    <section className="listing-section"><h2>Endereço e contato</h2><div className="listing-fields two"><label className="full">Pesquisar novo endereço<MapPlaceSearch onSelect={(item) => { setAddress(item.formattedAddress); setCoordinates({ lat: item.lat, lng: item.lng }); }} /><small>Atual: {address}</small></label><label>Nome de exibição<input name="displayName" defaultValue={listing.displayName} required /></label><label>WhatsApp<input name="whatsapp" defaultValue={listing.whatsapp} required /></label></div></section>
    {message ? <div className="listing-error" role="status">{message}</div> : null}<footer className="listing-submit"><a className="secondary-button" href="/minha-conta/anuncios">Cancelar</a><button className="primary-button" disabled={busy || !images.length}>{busy ? "Salvando…" : "Salvar e enviar para aprovação"}</button></footer>
  </form></section></main>;
}
