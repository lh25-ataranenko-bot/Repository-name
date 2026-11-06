import Link from "next/link";
import { api } from "@/lib/api";
import { FUEL, nf, usd, years } from "@/lib/format";
import type { Car } from "@/lib/types";

type Item = Pick<Car, "slug" | "brand" | "model" | "generation" | "name" | "year_from" | "year_to" | "in_production" | "fuel" | "hp" | "reliability" | "price" | "tco_5y"> & {
  diff: { price: number | null; tco_5y: number | null; reliability: number | null; hp: number | null };
};

/** Signed difference; for money a lower value is better, for reliability and power a higher one. */
function Delta({ v, money, unit = "", higherIsBetter = false }: { v: number | null; money?: boolean; unit?: string; higherIsBetter?: boolean }) {
  if (v == null || Math.abs(v) < 0.5) return <span className="small muted">так само</span>;
  const good = higherIsBetter ? v > 0 : v < 0;
  const text = `${v > 0 ? "+" : "−"}${money ? usd(Math.abs(v)) : nf(Math.abs(v)) + unit}`;
  return <span className={`small ${good ? "good-text" : "bad-text"}`}>{text}</span>;
}

/** Alternatives of the same class and price from other models (server component). */
export async function Similar({ slug }: { slug: string }) {
  let data: { items: Item[] } | null = null;
  try {
    data = await api<{ items: Item[] }>(`/api/cars/${encodeURIComponent(slug)}/similar`);
  } catch {
    return null; // the rest of the page is still useful without this block
  }
  if (!data.items.length) return null;
  return (
    <section className="stack" aria-labelledby="similar-h">
      <h3 id="similar-h">Схожі авто за класом і ціною</h3>
      <p className="small muted">Інші моделі того ж типу кузова з ціною в межах ±30 %. Різниця — відносно цього авто: зелене вигідніше.</p>
      <div className="tbl-wrap"><table>
        <thead><tr><th>Модифікація</th><th className="n">Ціна</th><th className="n">Володіння 5 р.</th><th className="n">Надійність</th><th className="n">Потужність</th><th /></tr></thead>
        <tbody>{data.items.map((c) => (
          <tr key={c.slug}>
            <td><Link href={`/cars/${c.slug}`}><b>{c.brand} {c.model}</b> {c.name}</Link><div className="small muted">{c.generation} · {years(c)} · {FUEL[c.fuel]}</div></td>
            <td className="n">{usd(c.price)}<div><Delta v={c.diff.price} money /></div></td>
            <td className="n">{usd(c.tco_5y)}<div><Delta v={c.diff.tco_5y} money /></div></td>
            <td className="n">{c.reliability ?? "—"}<div><Delta v={c.diff.reliability} higherIsBetter /></div></td>
            <td className="n">{c.hp != null ? `${nf(c.hp)} к.с.` : "—"}<div><Delta v={c.diff.hp} unit=" к.с." higherIsBetter /></div></td>
            <td><Link className="btn btn-sm" href={`/compare?add=${slug},${c.slug}`}>Порівняти</Link></td>
          </tr>
        ))}</tbody>
      </table></div>
    </section>
  );
}
