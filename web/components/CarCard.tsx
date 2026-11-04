"use client";

import Link from "next/link";
import { BODY, DRIVE, FUEL, isEV, usd, nf, years } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Car } from "@/lib/types";
import { Silhouette } from "./Silhouette";

export const ND = <span className="nd">Немає даних</span>;

export function CarCard({ car: c }: { car: Car }) {
  const { compare, toggleCompare, favs, toggleFav } = useStore();
  const inCmp = compare.includes(c.slug);
  const fav = favs.includes(c.slug);
  const real = c.cons_real != null;
  const cons = c.cons_real ?? c.cons_pass;
  return (
    <article className="car">
      <div className="spread">
        <span className="crumb">{c.brand} › {c.model} › {c.generation}</span>
        <button className="icon-btn" aria-pressed={fav} aria-label="Обране" onClick={() => toggleFav(c.slug)}>{fav ? "★" : "☆"}</button>
      </div>
      <Silhouette body={c.body} />
      <div>
        <h3>{c.name}</h3>
        <p className="sub">{years(c)} · {FUEL[c.fuel]} · {BODY[c.body]} · {DRIVE[c.drive]} привід</p>
      </div>
      <dl className="kv">
        <div><dt>Потужність</dt><dd>{c.hp != null ? `${nf(c.hp)} к.с.` : ND}</dd></div>
        <div><dt>0–100 км/год</dt><dd>{c.acc != null ? `${nf(c.acc, 1)} с` : ND}</dd></div>
        <div><dt>{real || cons == null ? "Витрата (реальна)" : "Витрата (паспорт)"}</dt><dd>{cons != null ? `${nf(cons, 1)} ${isEV(c) ? "кВт·год" : "л"}` : ND}</dd></div>
        <div><dt>Надійність</dt><dd>{c.reliability != null ? `${c.reliability}/100` : ND}</dd></div>
      </dl>
      <div />
      {c.for_year ? (
        <div className="car-foot"><span className="price">{c.price_for_year != null ? usd(c.price_for_year) : ND}</span><span className="small muted">оцінка для {c.for_year} р.</span></div>
      ) : (
        <div className="car-foot"><span className="price">{c.price != null ? usd(c.price) : ND}</span><span className="small muted">ціна, {c.year_ref ?? "—"} р.</span></div>
      )}
      <div className="car-actions">
        <Link className="btn" href={c.for_year ? `/cars/${c.slug}?year=${c.for_year}` : `/cars/${c.slug}`}>Детальніше</Link>
        <button className={inCmp ? "btn-primary" : ""} onClick={() => toggleCompare(c.slug)}>{inCmp ? "✓ У порівнянні" : "+ Порівняти"}</button>
      </div>
    </article>
  );
}
