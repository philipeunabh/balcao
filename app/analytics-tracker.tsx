"use client";

import { useEffect } from "react";

function report(event: "pageview" | "heartbeat") {
  return fetch("/api/analytics/collect", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ event, path: `${location.pathname}${location.search}` }), keepalive: true,
  }).catch(() => undefined);
}

function analyticsAllowed(){try{return JSON.parse(localStorage.getItem("balcao-cookie-consent-v1")||"null")?.analytics===true;}catch{return false;}}

export default function AnalyticsTracker({measurementId=""}:{measurementId?:string}) {
  useEffect(() => {
    let timer:number|undefined;let active=false;
    const start=()=>{if(active||!analyticsAllowed())return;active=true;void report("pageview");timer=window.setInterval(()=>{if(document.visibilityState==="visible")void report("heartbeat");},60_000);if(measurementId&&!document.querySelector('script[data-balcao-gtag]')){const script=document.createElement("script");script.async=true;script.src=`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;script.dataset.balcaoGtag="true";document.head.appendChild(script);const win=window as typeof window&{dataLayer?:unknown[];gtag?:(...args:unknown[])=>void};win.dataLayer=win.dataLayer||[];win.gtag=(...args:unknown[])=>win.dataLayer?.push(args);win.gtag("js",new Date());win.gtag("config",measurementId,{anonymize_ip:true});}};
    const onPageShow=()=>{if(active)void report("pageview");};const onConsent=()=>start();start();window.addEventListener("popstate",onPageShow);window.addEventListener("balcao-cookie-consent-changed",onConsent);return()=>{if(timer)window.clearInterval(timer);window.removeEventListener("popstate",onPageShow);window.removeEventListener("balcao-cookie-consent-changed",onConsent);};
  }, [measurementId]);
  return null;
}
