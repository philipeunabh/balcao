"use client";

import { useLayoutEffect } from "react";

const NEWS_CACHE_KEY = "balcao-news-cache";
const ONE_HOUR = 60 * 60 * 1000;

export default function NewsCachePolicy() {
  useLayoutEffect(() => {
    try {
      const raw = localStorage.getItem(NEWS_CACHE_KEY);
      if (!raw) return;
      const cached = JSON.parse(raw) as { at?: number };
      const cachedAt = Number(cached.at || 0);
      if (!Number.isFinite(cachedAt) || Date.now() - cachedAt >= ONE_HOUR) {
        localStorage.removeItem(NEWS_CACHE_KEY);
      }
    } catch {
      localStorage.removeItem(NEWS_CACHE_KEY);
    }
  }, []);

  return null;
}
