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
    const { items } = await api<{ items: Car[] }>("/api/cars");
    for (const c of items) {
      pages.push({ url: `${SITE_URL}/cars/${c.slug}`, lastModified: c.updated_at ?? undefined, changeFrequency: "monthly", priority: 0.8 });
    }
  } catch {
    // API unavailable: still serve the static pages
  }
  return pages;
}
