import type { MetadataRoute } from "next";
import { api } from "@/lib/api";
import { SITE_URL } from "@/lib/site";
import type { Car } from "@/lib/types";

// Built per request so new catalogue entries appear without a redeploy.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = ["", "/catalog", "/compare", "/tco", "/rating", "/check"].map((p) => ({
    url: SITE_URL + p, changeFrequency: "weekly", priority: p === "" ? 1 : 0.6,
  }));
  try {
    const models = await api<{ brand: string; model: string }[]>("/api/models");
    for (const m of models) {
      pages.push({ url: `${SITE_URL}/models/${encodeURIComponent(m.brand)}/${encodeURIComponent(m.model)}`, changeFrequency: "monthly", priority: 0.7 });
    }
    // Every modification, page by page (the API serves at most 200 at a time).
    const items: Car[] = [];
    for (let offset = 0; ; offset += 200) {
      const page = await api<{ count: number; items: Car[] }>(`/api/cars?limit=200&offset=${offset}`);
      items.push(...page.items);
      if (items.length >= page.count || !page.items.length) break;
    }
    for (const c of items) {
      pages.push({ url: `${SITE_URL}/cars/${c.slug}`, lastModified: c.updated_at ?? undefined, changeFrequency: "monthly", priority: 0.8 });
    }
  } catch {
    // API unavailable: still serve the static pages
  }
  return pages;
}
