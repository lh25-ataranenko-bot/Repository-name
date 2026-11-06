import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CarCard } from "@/components/CarCard";
import { api, ApiError } from "@/lib/api";
import { BODY, FUEL, span, usd } from "@/lib/format";
import type { Car } from "@/lib/types";
import { modelHref, type ModelRow } from "../../page";

interface ModelPage extends ModelRow {
  generations_list: { generation: string; year_from: number; year_to: number; in_production?: boolean; modifications: Car[] }[];
  most_reliable: string | null;
  cheapest_to_own: string | null;
  other_models: string[];
}

async function load(brand: string, model: string): Promise<ModelPage> {
  try {
    return await api<ModelPage>(`/api/models/${encodeURIComponent(brand)}/${encodeURIComponent(model)}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
}

type Params = Promise<{ brand: string; model: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { brand, model } = await params;
  const b = decodeURIComponent(brand), m = decodeURIComponent(model);
  return { title: `${b} ${m}: покоління й модифікації`, description: `Усі покоління ${b} ${m}: роки випуску, двигуни, ціни, надійність.` };
}

export default async function Model({ params }: { params: Params }) {
  const { brand, model } = await params;
  const d = await load(decodeURIComponent(brand), decodeURIComponent(model));
  const all = d.generations_list.flatMap((g) => g.modifications);
  const pick = (slug: string | null) => all.find((c) => c.slug === slug);
  const reliable = pick(d.most_reliable), cheap = pick(d.cheapest_to_own);
  const total = Math.max(1, (d.year_to ?? 0) - (d.year_from ?? 0) + 1);

  return (
    <div className="stack-lg">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <p className="crumb"><Link href="/models">Моделі</Link> › {d.brand} › {d.model}</p>
        <h1>{d.brand} {d.model}</h1>
        <p>{span(d.year_from, d.year_to, d.in_production)} · поколінь у каталозі: {d.generations} · модифікацій: {d.modifications} ·
          {" "}{[...new Set(all.map((c) => FUEL[c.fuel]))].join(", ")}</p>
      </div>

      <div className="stats">
        <div className="stat"><span className="label">Ціни</span><span className="big-num">{d.price_min === d.price_max ? usd(d.price_min) : `${usd(d.price_min)} – ${usd(d.price_max)}`}</span><span className="small muted">за роком, до якого належить ціна</span></div>
        {reliable && <div className="stat"><span className="label">Найнадійніша версія</span><Link href={`/cars/${reliable.slug}`}><b>{reliable.generation} · {reliable.name}</b></Link><span className="small muted">надійність {reliable.reliability}/100</span></div>}
        {cheap && <div className="stat"><span className="label">Найдешевша у володінні</span><Link href={`/cars/${cheap.slug}`}><b>{cheap.generation} · {cheap.name}</b></Link><span className="small muted">{usd(cheap.tco_5y)} за 5 років</span></div>}
      </div>

      <section className="panel stack">
        <h3>Покоління на шкалі років</h3>
        <div className="timeline" role="list">
          {d.generations_list.map((g) => (
            <div key={g.generation} className="tl-row" role="listitem">
              <a className="small" href={`#gen-${g.generation.replace(/\W+/g, "-")}`}><b>{g.generation}</b></a>
              <div className="tl-track">
                <span className="tl-bar" style={{ left: `${((g.year_from - (d.year_from ?? 0)) / total) * 100}%`, width: `${((g.year_to - g.year_from + 1) / total) * 100}%` }}>
                  {span(g.year_from, g.year_to, g.in_production)}
                </span>
              </div>
            </div>
          ))}
          <div className="tl-row"><span /><div className="tl-axis"><span>{d.year_from}</span><span>{d.in_production ? "досі" : d.year_to}</span></div></div>
        </div>
      </section>

      {[...d.generations_list].reverse().map((g) => (
        <section key={g.generation} id={`gen-${g.generation.replace(/\W+/g, "-")}`} className="stack" style={{ scrollMarginTop: 80 }}>
          <div className="spread"><h2>{d.model} {g.generation}</h2><span className="muted">{span(g.year_from, g.year_to, g.in_production)} · {g.modifications.map((c) => BODY[c.body]).filter((v, i, a) => a.indexOf(v) === i).join(", ")}</span></div>
          <div className="cards">{g.modifications.map((c) => <CarCard key={c.slug} car={c} />)}</div>
          {g.modifications.length > 1 && (
            <p className="small"><Link href={`/compare?add=${g.modifications.slice(0, 5).map((c) => c.slug).join(",")}`}>Порівняти модифікації {g.generation}</Link></p>
          )}
        </section>
      ))}

      {d.other_models.length > 0 && (
        <section className="stack"><h3>Інші моделі {d.brand}</h3>
          <div className="chips">{d.other_models.map((m) => <Link key={m} className="chip" href={modelHref(d.brand, m)}>{m}</Link>)}</div>
        </section>
      )}
      <p className="small muted">Дані каталогу демонстраційні.</p>
    </div>
  );
}
