"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { KeyboardEvent, useEffect, useRef, useState } from "react";

export type MapPlaceResult = { formattedAddress: string; placeId: string; lat: number; lng: number };
export type GooglePlaceResult = MapPlaceResult;
type Suggestion = { id: string; primary: string; secondary: string; prediction: any };
type PlacesAdapter =
  | { mode: "modern"; library: any }
  | { mode: "legacy"; library: any; autocomplete: any; details: any };

declare global { interface Window { google?: any; gm_authFailure?: () => void; } }

async function loadGoogleMaps(apiKey: string) {
  if (window.google?.maps && (typeof window.google.maps.importLibrary === "function" || window.google.maps.places?.AutocompleteService)) return;
  const existing = document.getElementById("balcao-google-maps-script") as HTMLScriptElement | null;
  if (existing) {
    await new Promise<void>((resolve, reject) => {
      if (window.google?.maps && (typeof window.google.maps.importLibrary === "function" || window.google.maps.places?.AutocompleteService)) return resolve();
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Não foi possível carregar a Maps JavaScript API.")), { once: true });
    });
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script"); script.id = "balcao-google-maps-script"; script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&libraries=places&language=pt-BR&region=BR&loading=async`;
    script.onload = () => resolve(); script.onerror = () => reject(new Error("Não foi possível carregar a Maps JavaScript API.")); document.head.appendChild(script);
  });
}

export function MapPlaceSearch({ onSelect }: { onSelect: (result: MapPlaceResult) => void }) {
  const onSelectRef = useRef(onSelect); const placesRef = useRef<PlacesAdapter | null>(null); const sessionTokenRef = useRef<any>(null);
  const requestRef = useRef(0); const [query, setQuery] = useState(""); const [ready, setReady] = useState(false);
  const [fallback, setFallback] = useState(false); const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]); const [activeIndex, setActiveIndex] = useState(-1);
  const [provider, setProvider] = useState<"google" | "mapbox">("google");
  const [status, setStatus] = useState("Carregando a pesquisa do Google Maps…");

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => {
    let active = true;
    window.gm_authFailure = () => { if (active) { setFallback(true); setReady(false); setStatus("A chave do Google Maps foi rejeitada para este domínio. Usando pesquisa alternativa."); } };
    fetch("/api/maps/config").then((response) => response.json()).then(async (settings) => {
      const selectedProvider = settings.provider === "mapbox" ? "mapbox" : "google"; setProvider(selectedProvider);
      if (!settings.configured || !settings.apiKey) throw new Error(`${selectedProvider === "mapbox" ? "O Mapbox" : "A API do Google Maps"} ainda não foi configurado.`);
      if (selectedProvider === "mapbox") { setFallback(true); setReady(false); setStatus(""); return; }
      await loadGoogleMaps(String(settings.apiKey));
      const maps = window.google?.maps;
      if (!maps) throw new Error("A Maps JavaScript API não foi inicializada.");
      let places = maps.places;
      if (typeof maps.importLibrary === "function") places = await maps.importLibrary("places");
      if (!active) return;
      if (places?.AutocompleteSuggestion) {
        placesRef.current = { mode: "modern", library: places };
      } else if (places?.AutocompleteService && places?.PlacesService) {
        placesRef.current = { mode: "legacy", library: places, autocomplete: new places.AutocompleteService(), details: new places.PlacesService(document.createElement("div")) };
      } else {
        throw new Error("A biblioteca Places não foi carregada pela chave configurada.");
      }
      sessionTokenRef.current = new places.AutocompleteSessionToken(); setReady(true); setStatus("");
    }).catch((error) => { if (active) { setFallback(true); setStatus(error instanceof Error ? error.message : "Pesquisa alternativa ativada."); } });
    return () => { active = false; if (window.gm_authFailure) delete window.gm_authFailure; };
  }, []);

  useEffect(() => {
    const value = query.trim(); if (value.length < 3 || (!ready && !fallback)) return;
    const requestId = ++requestRef.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        if (ready && placesRef.current) {
          const adapter = placesRef.current;
          if (!sessionTokenRef.current) sessionTokenRef.current = new adapter.library.AutocompleteSessionToken();
          let next: Suggestion[];
          if (adapter.mode === "modern") {
            const response = await adapter.library.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: value, includedRegionCodes: ["br"], language: "pt-BR", region: "br", origin: { lat: -19.9166813, lng: -43.9344931 }, sessionToken: sessionTokenRef.current });
            next = (response.suggestions || []).flatMap((item: any) => {
              const prediction = item.placePrediction; if (!prediction) return [];
              return [{ id: prediction.placeId, primary: prediction.mainText?.text || prediction.text?.text || String(prediction.text || ""), secondary: prediction.secondaryText?.text || "", prediction }];
            }).slice(0, 6);
          } else {
            const predictions = await new Promise<any[]>((resolve, reject) => adapter.autocomplete.getPlacePredictions({ input: value, componentRestrictions: { country: "br" }, language: "pt-BR", region: "br", locationBias: { center: { lat: -19.9166813, lng: -43.9344931 }, radius: 50000 }, sessionToken: sessionTokenRef.current }, (items: any[] | null, serviceStatus: string) => {
              if (serviceStatus === "OK") resolve(items || []);
              else if (serviceStatus === "ZERO_RESULTS") resolve([]);
              else reject(new Error(`A pesquisa de endereços retornou ${serviceStatus}.`));
            }));
            next = predictions.map((prediction) => ({ id: prediction.place_id, primary: prediction.structured_formatting?.main_text || prediction.description, secondary: prediction.structured_formatting?.secondary_text || "", prediction })).slice(0, 6);
          }
          if (requestId !== requestRef.current) return;
          setSuggestions(next); setActiveIndex(-1); setStatus(next.length ? "" : "Nenhum endereço encontrado.");
        } else {
          const response = await fetch(`/api/maps/geocode?q=${encodeURIComponent(value)}`); const data = await response.json().catch(() => ({}));
          if (requestId !== requestRef.current) return;
          const next = (Array.isArray(data.results) ? data.results : []).map((item: MapPlaceResult) => ({ id: item.placeId || item.formattedAddress, primary: item.formattedAddress, secondary: "", prediction: item }));
          setSuggestions(next); setActiveIndex(-1); setStatus(response.ok ? (next.length ? "" : "Nenhum endereço encontrado.") : data.error || "Não foi possível pesquisar o endereço.");
        }
      } catch (error) { if (requestId === requestRef.current) { setSuggestions([]); setStatus(error instanceof Error ? error.message : "Não foi possível consultar o endereço."); } }
      finally { if (requestId === requestRef.current) setLoading(false); }
    }, 280);
    return () => window.clearTimeout(timer);
  }, [fallback, query, ready]);

  async function choose(item: Suggestion) {
    setLoading(true); setSuggestions([]); setActiveIndex(-1);
    try {
      const adapter = placesRef.current;
      if (ready && adapter?.mode === "modern" && item.prediction?.toPlace) {
        const place = item.prediction.toPlace(); await place.fetchFields({ fields: ["formattedAddress", "location", "id"] });
        const lat = place.location?.lat?.(); const lng = place.location?.lng?.();
        if (typeof lat !== "number" || typeof lng !== "number") throw new Error("O endereço selecionado não retornou latitude e longitude.");
        const formattedAddress = place.formattedAddress || [item.primary, item.secondary].filter(Boolean).join(", ");
        setQuery(formattedAddress); onSelectRef.current({ formattedAddress, placeId: place.id || item.id, lat, lng });
        sessionTokenRef.current = new adapter.library.AutocompleteSessionToken(); setStatus("Endereço selecionado e coordenadas atualizadas.");
      } else if (ready && adapter?.mode === "legacy") {
        const place = await new Promise<any>((resolve, reject) => adapter.details.getDetails({ placeId: item.id, fields: ["formatted_address", "geometry", "place_id"], sessionToken: sessionTokenRef.current }, (result: any, serviceStatus: string) => {
          if (serviceStatus === "OK" && result) resolve(result);
          else reject(new Error(`Não foi possível obter as coordenadas (${serviceStatus}).`));
        }));
        const lat = place.geometry?.location?.lat?.(); const lng = place.geometry?.location?.lng?.();
        if (typeof lat !== "number" || typeof lng !== "number") throw new Error("O endereço selecionado não retornou latitude e longitude.");
        const formattedAddress = place.formatted_address || [item.primary, item.secondary].filter(Boolean).join(", ");
        setQuery(formattedAddress); onSelectRef.current({ formattedAddress, placeId: place.place_id || item.id, lat, lng });
        sessionTokenRef.current = new adapter.library.AutocompleteSessionToken(); setStatus("Endereço selecionado e coordenadas atualizadas.");
      } else {
        const result = item.prediction as MapPlaceResult; setQuery(result.formattedAddress); onSelectRef.current(result); setStatus("Endereço selecionado e coordenadas atualizadas.");
      }
    } catch (error) { setStatus(error instanceof Error ? error.message : "Não foi possível selecionar o endereço."); }
    finally { setLoading(false); }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!suggestions.length) return;
    if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((current) => Math.min(current + 1, suggestions.length - 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((current) => Math.max(current - 1, 0)); }
    else if (event.key === "Enter" && activeIndex >= 0) { event.preventDefault(); void choose(suggestions[activeIndex]); }
    else if (event.key === "Escape") setSuggestions([]);
  }

  return <div className="google-place-search">
    <input role="combobox" aria-label={`Pesquisar endereço no ${provider === "mapbox" ? "Mapbox" : "Google Maps"}`} aria-autocomplete="list" aria-expanded={Boolean(suggestions.length)} aria-controls="google-place-suggestions" value={query} onChange={(event) => { setQuery(event.target.value); setStatus(""); if (event.target.value.trim().length < 3) { requestRef.current += 1; setSuggestions([]); setActiveIndex(-1); setLoading(false); } }} onKeyDown={handleKeyDown} placeholder="Comece a digitar rua, número, bairro ou local" autoComplete="off" />
    {loading ? <small className="listing-address-status">Buscando endereços no {provider === "mapbox" ? "Mapbox" : "Google Maps"}…</small> : null}
    {suggestions.length ? <div id="google-place-suggestions" className="listing-address-results" role="listbox">{suggestions.map((item, index) => <button type="button" role="option" aria-selected={index === activeIndex} className={index === activeIndex ? "active" : ""} key={item.id} onMouseDown={(event) => event.preventDefault()} onClick={() => void choose(item)}><strong>{item.primary}</strong>{item.secondary ? <small>{item.secondary}</small> : null}</button>)}</div> : null}
    {status ? <small className={status.includes("selecionado") ? "listing-coordinates" : "listing-address-error"}>{status}</small> : null}
  </div>;
}

export const GooglePlaceSearch = MapPlaceSearch;
