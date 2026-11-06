import type { Metadata } from "next";
import Link from "next/link";
import { api } from "@/lib/api";
import { BODY, span, usd } from "@/lib/format";

export const metadata: Metadata = { title: "Марки й моделі", description: "Усі марки й моделі автомобілів, що випускалися з 1990 року: роки випуску, покоління, модифікації й ціни." };
export const dynamic = "force-dynamic";

export interface ModelRow {
  brand: string; model: string; generations: number; modifications: number;
  year_from: number | null; year_to: number | null; in_production?: boolean; price_min: number | null; price_max: number | null;
  bodies: string[]; fuels: string[];
  alias?: string | null; years_note?: string | null; wikidata?: string | null; country?: string | null;
}
export interface BrandRow { brand: string; country: string | null; alias: string | null; models: number; models_in_production: number; models_with_specs: number; modifications: number }
export const modelHref = (brand: string, model: string) => `/models/${encodeURIComponent(brand)}/${encodeURIComponent(model)}`;
export const brandHref = (brand: string) => `/models/${encodeURIComponent(brand)}`;

/** One model in a list: years, body and either prices from the catalogue or a note that specs are not added yet. */
export function ModelTile({ r, withBrand = false }: { r: ModelRow; withBrand?: boolean }) {
  return (
    <Link className="model-tile" href={modelHref(r.brand, r.model)}>
      <b>{withBrand ? `${r.brand} ${r.model}` : r.model}</b>
      {r.alias && <span className="small muted">також: {r.alias}</span>}
      <span className="small muted">{span(r.year_from, r.year_to, r.in_production)}{r.bodies.length ? ` · ${r.bodies.map((x) => BODY[x] ?? x).join(", ")}` : ""}</span>
      {r.modifications
        ? <span className="small"><span className="num">{r.price_min === r.price_max ? usd(r.price_min) : `${usd(r.price_min)} – ${usd(r.price_max)}`}</span> · модифікацій: {r.modifications}</span>
        : <span className="small muted">Характеристики ще не додані</span>}
    </Link>
  );
}

export default async function Models({ searchParams }: { searchParams: Promise<{ q?: string; specs?: string }> }) {
  const { q = "", specs } = await searchParams;
  const brands = await api<BrandRow[]>("/api/brands");
  const query = q.trim().toLowerCase();
  const found = query
    ? (await api<ModelRow[]>(`/api/models${specs ? "?with_specs=true" : ""}`)).filter((r) =>
        `${r.brand} ${r.model} ${r.alias ?? ""}`.toLowerCase().includes(query)).slice(0, 120)
    : null;
  const totalModels = brands.reduce((n, b) => n + b.models, 0);
  const withSpecs = brands.reduce((n, b) => n + b.models_with_specs, 0);
  return (
    <>
      <div className="page-head"><p className="eyebrow">Довідник · {brands.length} марок · {totalModels} моделей</p><h1>Марки й моделі</h1>
        <p>Усі моделі, що випускалися з 1990 року. Для {withSpecs} моделей у каталозі вже є модифікації з характеристиками, цінами й надійністю;
          для решти показано роки випуску й тип кузова, характеристики додаються поступово.</p></div>
      <form className="panel row" role="search" action="/models" style={{ marginBottom: 20, alignItems: "end" }}>
        <div className="field" style={{ flex: "1 1 260px" }}><label htmlFor="m-q">Знайти модель</label><input id="m-q" name="q" defaultValue={q} placeholder="Наприклад, Octavia, RAV4 або Optima" /></div>
        <label className="check"><input type="checkbox" name="specs" value="1" defaultChecked={!!specs} /> Лише з характеристиками</label>
        <button className="btn-primary" type="submit">Знайти</button>
      </form>
      {found ? (
        <section className="stack">
          <div className="spread"><h2>Знайдено: {found.length}{found.length === 120 ? "+" : ""}</h2><Link href="/models">Усі марки</Link></div>
          {found.length ? <div className="model-grid">{found.map((r) => <ModelTile key={r.brand + r.model} r={r} withBrand />)}</div>
            : <p className="muted">Нічого не знайдено. Спробуйте коротший запит або іншу назву моделі.</p>}
        </section>
      ) : (
        <div className="brand-grid">
          {brands.map((b) => (
            <Link key={b.brand} className="model-tile" href={brandHref(b.brand)}>
              <b>{b.brand}</b>
              <span className="small muted">{b.country ?? "—"}{b.alias ? ` · також ${b.alias}` : ""}</span>
              <span className="small">моделей: {b.models} · випускаються: {b.models_in_production}</span>
              <span className="small muted">з характеристиками: {b.models_with_specs}</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
