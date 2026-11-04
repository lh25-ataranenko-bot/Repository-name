"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { usd } from "@/lib/format";

/** Production-year picker: the estimated market price follows the chosen year. */
export function YearPicker({ slug, years, prices, year, refYear }: {
  slug: string; years: number[]; prices: Record<string, number | null>; year: number | null; refYear: number | null;
}) {
  const router = useRouter();
  if (!years.length) return null;
  const chosen = year ?? refYear ?? years[years.length - 1];
  const price = prices[String(chosen)];
  const max = Math.max(...years.map((y) => prices[String(y)] ?? 0), 1);
  return (
    <section className="panel stack">
      <div className="spread">
        <h3>Ціна за роком випуску</h3>
        <div className="row">
          <label htmlFor="car-year">Рік</label>
          <select id="car-year" value={chosen} style={{ width: "auto" }}
            onChange={(e) => router.replace(`/cars/${slug}?year=${e.target.value}`, { scroll: false })}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>
      <div className="year-bars" role="img" aria-label="Оцінка ринкової ціни за роками випуску">
        {years.map((y) => {
          const p = prices[String(y)];
          return (
            <button key={y} className={`year-bar${y === chosen ? " on" : ""}`} title={`${y}: ${usd(p)}`}
              onClick={() => router.replace(`/cars/${slug}?year=${y}`, { scroll: false })}>
              <span className="year-fill" style={{ height: `${p ? Math.max(8, (p / max) * 100) : 0}%` }} />
              <span className="small">{y}</span>
            </button>
          );
        })}
      </div>
      <p>Орієнтовна ринкова ціна авто {chosen} року: <b className="num">{usd(price)}</b>
        <span className="small muted"> — розраховано від ціни {refYear} р. зі знеціненням за рік.</span></p>
      <div className="row">
        <Link className="btn" href={`/tco?add=${slug}${price ? `&price=${price}` : ""}`}>Витрати на авто {chosen} року</Link>
        <Link className="btn" href={`/check?slug=${slug}&year=${chosen}`}>Перевірити оголошення {chosen} року</Link>
      </div>
    </section>
  );
}
