"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    let refreshing = false;
    const readRefreshGuard = () => {
      try { return sessionStorage.getItem("balcao-sw-refresh") === "1"; }
      catch { return false; }
    };
    const writeRefreshGuard = (value?: string) => {
      try {
        if (value) sessionStorage.setItem("balcao-sw-refresh", value);
        else sessionStorage.removeItem("balcao-sw-refresh");
      } catch {
        // Armazenamento pode estar bloqueado em modos de privacidade restritos.
      }
    };
    const onControllerChange = () => {
      if (refreshing || readRefreshGuard()) return;
      refreshing = true;
      writeRefreshGuard("1");
      window.location.reload();
    };
    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
        await registration.update().catch(() => undefined);
        registration.waiting?.postMessage({ type: "SKIP_WAITING" });
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) worker.postMessage({ type: "SKIP_WAITING" });
          });
        });
      } catch {
        // O site continua funcional mesmo quando o navegador bloqueia PWA.
      }
    };
    const onLoad = () => void register();
    writeRefreshGuard();
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    if (document.readyState === "complete") void register();
    else window.addEventListener("load", onLoad, { once: true });
    return () => {
      window.removeEventListener("load", onLoad);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
