import type { Metadata } from "next";
import Link from "next/link";
import { api } from "@/lib/api";
import { BODY, usd } from "@/lib/format";

export const metadata: Metadata = { title: "Моделі", description: "Усі моделі каталогу AutoWise за марками: покоління, роки випуску, ціни." };
export const dynamic = "force-dynamic";

export interface ModelRow {
  brand: string; model: string; generations: number; modifications: number;
  year_from: number | null; year_to: number | null; price_min: number | null; price_max: number | null;
  bodies: string[]; fuels: string[];
}
export const modelHref = (brand: string, model: string) => `/models/${encodeURIComponent(brand)}/${encodeURIComponent(model)}`;

export default async function Models() {
  const rows = await api<ModelRow[]>("/api/models");
  const brands = [...new Set(rows.map((r) => r.brand))];
  return (
    <>
      <div className="page-head"><p className="eyebrow">Моделі · {rows.length} у каталозі</p><h1>Моделі за марками</h1>
        <p>Оберіть модель, щоб побачити всі її покоління, роки випуску й конкретні модифікації.</p></div>
      <nav className="chips" aria-label="Марки" style={{ marginBottom: 20 }}>
        {brands.map((b) => <a key={b} className="chip" href={`#brand-${b.replace(/\W+/g, "-")}`}>{b}</a>)}
      </nav>
      <div className="stack-lg">
        {brands.map((b) => (
          <section key={b} id={`brand-${b.replace(/\W+/g, "-")}`} className="stack" style={{ scrollMarginTop: 80 }}>
            <h2>{b}</h2>
            <div className="model-grid">
              {rows.filter((r) => r.brand === b).map((r) => (
                <Link key={r.model} className="model-tile" href={modelHref(r.brand, r.model)}>
                  <b>{r.model}</b>
                  <span className="small muted">{r.year_from}–{r.year_to} · поколінь: {r.generations} · модифікацій: {r.modifications}</span>
                  <span className="small">{r.bodies.map((x) => BODY[x] ?? x).join(", ")}</span>
                  <span className="num small">{r.price_min === r.price_max ? usd(r.price_min) : `${usd(r.price_min)} – ${usd(r.price_max)}`}</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
