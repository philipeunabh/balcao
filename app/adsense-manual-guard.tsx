"use client";

import { useEffect } from "react";

const AUTO_AD_SELECTORS = [
  ".google-auto-placed",
  ".adsbygoogle-noablate",
  "[id^='google_ads_']",
  "[id*='google_anchor']",
  "[class*='bottom-anchor']",
  "[class*='top-anchor']",
  "ins.adsbygoogle.adsbygoogle-noablate",
  "ins.adsbygoogle[data-anchor-status]",
  "[data-anchor-status]",
].join(",");

function belongsToManualUnit(element: Element) {
  return Boolean(element.closest(".adsense-unit"));
}

function directBodyChild(element: Element) {
  let current: Element | null = element;
  while (current?.parentElement && current.parentElement !== document.body) {
    current = current.parentElement;
  }
  return current?.parentElement === document.body ? current : null;
}

function removeAutomaticAds() {
  document.querySelectorAll<HTMLElement>(AUTO_AD_SELECTORS).forEach((element) => {
    if (belongsToManualUnit(element)) return;
    const root = directBodyChild(element);
    if (root && !root.matches("main, nav, header, footer")) root.remove();
    else element.remove();
  });

  document.querySelectorAll<HTMLIFrameElement>('iframe[id^="google_ads_iframe_"], iframe[src*="googlesyndication.com"]').forEach((frame) => {
    if (belongsToManualUnit(frame)) return;
    const automaticContainer = frame.closest<HTMLElement>(".google-auto-placed, .adsbygoogle-noablate, ins.adsbygoogle, [data-anchor-status], [id*='google_anchor'], [class*='bottom-anchor']");
    const root = directBodyChild(automaticContainer || frame);
    const isOverlay = root ? ["fixed", "sticky"].includes(window.getComputedStyle(root).position) : false;
    const footer = document.querySelector("footer");
    const followsFooter = Boolean(root && footer && (footer.compareDocumentPosition(root) & Node.DOCUMENT_POSITION_FOLLOWING));
    if (root && !root.matches("main, nav, header, footer") && (isOverlay || followsFooter || Boolean(automaticContainer))) root.remove();
    else automaticContainer?.remove();
  });
}

export default function AdSenseManualGuard() {
  useEffect(() => {
    removeAutomaticAds();
    const observer = new MutationObserver(removeAutomaticAds);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "id", "style", "data-anchor-status"] });
    const repeatedCheck = window.setInterval(removeAutomaticAds, 750);
    const stopRepeatedCheck = window.setTimeout(() => window.clearInterval(repeatedCheck), 15_000);
    window.addEventListener("pageshow", removeAutomaticAds);
    window.addEventListener("scroll", removeAutomaticAds, { passive: true });
    return () => {
      observer.disconnect();
      window.clearInterval(repeatedCheck);
      window.clearTimeout(stopRepeatedCheck);
      window.removeEventListener("pageshow", removeAutomaticAds);
      window.removeEventListener("scroll", removeAutomaticAds);
    };
  }, []);

  return null;
}
