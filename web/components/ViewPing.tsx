"use client";

import { useEffect } from "react";
import { api } from "@/lib/api";

/** Counts one anonymous view of the page (once per browser session). */
export function ViewPing({ slug }: { slug: string }) {
  useEffect(() => {
    const key = `autowise-viewed-${slug}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch { /* storage blocked: the server still dedupes */ }
    api(`/api/cars/${slug}/view`, { method: "POST" }).catch(() => null);
  }, [slug]);
  return null;
}
