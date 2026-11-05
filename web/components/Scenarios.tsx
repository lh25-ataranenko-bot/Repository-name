"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { nf, usd } from "@/lib/format";
import type { Env, TcoInputs } from "@/lib/types";

interface Row { label: string; years: number; km_per_year: number; total: number; per_month: number; per_km: number; diff_per_month: number }
export interface CreditInput { down_payment_pct: number; rate_pct: number; term_months: number }

/** "What if" for one car: the same TCO with one assumption changed at a time. */
export function Scenarios({ cars, env, years, overrides, credit }: {
  cars: { slug: string; name: string }[]; env: Env; years: Record<string, number>;
  overrides: Record<string, Partial<TcoInputs>>; credit: CreditInput | null;
}) {
  const [slug, setSlug] = useState(cars[0]?.slug ?? "");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!cars.some((c) => c.slug === slug)) setSlug(cars[0]?.slug ?? ""); }, [cars, slug]);
  useEffect(() => {
    if (!slug) return;
    let stale = false;
    const t = setTimeout(() => api<{ rows: Row[] }>("/api/tco/scenarios", { method: "POST", json: {
      slug, env, year: years[slug] ?? null, overrides: overrides[slug] ?? {}, credit,
    } }).then((d) => { if (!stale) { setRows(d.rows); setError(null); } }).catch((e) => { if (!stale) { setRows(null); setError(e.message); } }), 250);
    return () => { stale = true; clearTimeout(t); };
  }, [slug, env, years, overrides, credit]);
  if (!cars.length) return null;
  const max = Math.max(1, ...(rows ?? []).map((r) => r.per_month));

  return (
    <section className="stack" style={{ marginTop: 26 }}>
      <div className="spread">
        <h3>Що буде, якщо…</h3>
        <div className="row"><label htmlFor="sc-car">Авто</label>
          <select id="sc-car" value={slug} onChange={(e) => setSlug(e.target.value)} style={{ width: "auto" }}>
            {cars.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select></div>
      </div>
      <p className="small muted">Той самий розрахунок, у якому змінюється лише одне припущення. Різниця — порівняно з рядком «Як зараз».</p>
      {error && <div className="notice">{error}</div>}
      {rows && (
        <div className="tbl-wrap"><table>
          <thead><tr><th>Сценарій</th><th className="n">Разом</th><th className="n">На місяць</th><th style={{ minWidth: 140 }} /><th className="n">Різниця на місяць</th></tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={r.label}><td>{i === 0 ? <b>{r.label}</b> : r.label}<div className="small muted">{r.years} р. · {nf(r.km_per_year)} км на рік</div></td>
              <td className="n">{usd(r.total)}</td><td className="n">{usd(r.per_month)}</td>
              <td><div className="bar"><i style={{ width: `${(r.per_month / max) * 100}%`, background: r.diff_per_month > 0 ? "var(--bad)" : r.diff_per_month < 0 ? "var(--good)" : "var(--accent)" }} /></div></td>
              <td className="n" style={{ color: r.diff_per_month > 0.5 ? "var(--bad)" : r.diff_per_month < -0.5 ? "var(--good)" : undefined }}>
                {Math.abs(r.diff_per_month) < 0.5 ? "—" : `${r.diff_per_month > 0 ? "+" : "−"}${usd(Math.abs(r.diff_per_month))}`}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </section>
  );
}
