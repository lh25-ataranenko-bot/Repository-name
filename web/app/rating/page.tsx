"use client";

import { BudgetField } from "@/components/BudgetField";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Dial } from "@/components/ScoreBars";
import { api } from "@/lib/api";
import { BODY, CATS, DRIVE, FUEL, PRESETS, usd, years as yearsOf } from "@/lib/format";
import { useStore } from "@/lib/store";
import { ModelYearFields } from "@/components/ModelYearFields";
import type { CategoryKey, Meta, RatingResponse } from "@/lib/types";

function Rating() {
  const p = useSearchParams();
  const { compare, toggleCompare } = useStore();
  const [presets, setPresets] = useState<Meta["presets"] | null>(null);
  const [preset, setPreset] = useState(p.get("preset") ?? "family");
  const [w, setW] = useState<Record<CategoryKey, number> | null>(null);
  const [f, setF] = useState({
    max_price: Number(p.get("max_price") ?? 25000), year: p.get("year") ?? "", brand: p.get("brand") ?? "", model: p.get("model") ?? "",
    trans: p.get("trans") ?? "any",
    drive: p.get("drive") ?? "any", fuel: p.get("fuel") ?? "any", body: p.get("body") ?? "any",
  });
  const tags = p.get("tags")?.split("|") ?? [];
  const [data, setData] = useState<RatingResponse | null>(null);

  useEffect(() => {
    api<Meta>("/api/meta").then((m) => {
      setPresets(m.presets);
      setW({ ...(m.presets[preset] ?? m.presets.balanced).w });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!w) return;
    const filters = { ...f, year: f.year ? Number(f.year) : null, brand: f.brand || null, model: f.model || null };
    const t = setTimeout(() => api<RatingResponse>("/api/rating", { method: "POST", json: { weights: w, filters } }).then(setData), 150);
    return () => clearTimeout(t);
  }, [w, f]);

  const choose = (k: string) => { setPreset(k); if (presets) setW({ ...presets[k].w }); };
  const sel = (id: keyof typeof f, label: string, opts: [string, string][]) => (
    <div className="field"><label htmlFor={`rt-${id}`}>{label}</label>
      <select id={`rt-${id}`} value={f[id]} onChange={(e) => setF({ ...f, [id]: e.target.value })}>{opts.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
  );

  return (
    <>
      <div className="page-head"><p className="eyebrow">Рейтинги та рекомендації</p><h1>Рейтинг під ваші пріоритети</h1>
        <p>Обов’язкові умови працюють як фільтри: висока оцінка комфорту не компенсує перевищення бюджету. Решта рахується зваженою сумою Score = Σ(wᵢ × sᵢ) / Σwᵢ.</p></div>
      {tags.length > 0 && <div className="chips" style={{ marginBottom: 16 }}><span className="label">З вашого запиту:</span>{tags.map((t) => <span className="chip on" key={t}>{t}</span>)}</div>}
      <div className="side-layout">
        <aside className="panel stack">
          <h3>Обов’язкові умови</h3>
          <BudgetField id="rt-max" label="Максимальна ціна" value={f.max_price} onChange={(v) => setF({ ...f, max_price: v })} />
          <ModelYearFields idPrefix="rt" value={{ brand: f.brand, model: f.model, year: f.year }} onChange={(v) => setF({ ...f, ...v })} />
          {sel("trans", "Коробка", [["any", "Будь-яка"], ["automatic", "Автоматична"], ["manual", "Механіка"]])}
          {sel("drive", "Привід", [["any", "Будь-який"], ...Object.entries(DRIVE)])}
          {sel("fuel", "Паливо", [["any", "Будь-яке"], ...Object.entries(FUEL)])}
          {sel("body", "Кузов", [["any", "Будь-який"], ...Object.entries(BODY)])}
          <hr />
          <h3>Пріоритети</h3>
          <div className="chips">{Object.entries(PRESETS).map(([k, n]) => <button key={k} className="chip" aria-pressed={preset === k} onClick={() => choose(k)}>{n}</button>)}</div>
          {w && <div className="stack" style={{ gap: 10 }}>{CATS.map(([k, l]) => (
            <div className="weight" key={k}>
              <label htmlFor={`w-${k}`}><span>{l}</span><output>{w[k]}</output></label>
              <input type="range" id={`w-${k}`} min={0} max={10} step={1} value={w[k]} onChange={(e) => { setPreset("custom"); setW({ ...w, [k]: +e.target.value }); }} />
            </div>
          ))}</div>}
        </aside>
        <section className="stack" style={{ minWidth: 0 }}>
          <p className="muted">{data ? `Підходить: ${data.matched} з ${data.matched + data.excluded_total}${data.matched > data.ranked.length ? `, показано найкращі ${data.ranked.length}` : ""}. Пріоритет: ${(PRESETS[preset] ?? "власні ваги").toLowerCase()}.` : "Рахуємо рейтинг…"}</p>
          <div className="rank">
            {data?.ranked.map((r, i) => {
              const c = r.car;
              return (
                <article className="rank-item" key={c.slug}>
                  <span className="pos">{i + 1}</span>
                  <div style={{ minWidth: 0 }}>
                    <p className="crumb">{c.brand} › {c.model} › {c.generation}</p>
                    <h3>{c.brand} {c.model} {c.name}</h3>
                    <p className="small muted">{yearsOf(c)} · {FUEL[c.fuel]} · {c.transmission} · {c.for_year ? `${usd(c.price_for_year)} за авто ${c.for_year} р.` : usd(c.price)}</p>
                    <div className="mini">{CATS.map(([k, l]) => (
                      <div key={k} title={`${l}: ${c.scores[k] ?? "немає даних"}`}><span>{l}</span><div className="bar"><i style={{ width: `${c.scores[k] ?? 0}%`, opacity: w && w[k] === 0 ? 0.35 : 1 }} /></div></div>
                    ))}</div>
                    <ul className="reasons">{r.reasons.map((x) => <li key={x.text} className={x.kind === "plus" ? "" : x.kind}>{x.text}</li>)}</ul>
                    <div className="row" style={{ marginTop: 10 }}>
                      <Link className="btn btn-sm" href={`/cars/${c.slug}`}>Детальніше</Link>
                      <button className={`btn-sm ${compare.includes(c.slug) ? "btn-primary" : ""}`} onClick={() => toggleCompare(c.slug)}>{compare.includes(c.slug) ? "✓ У порівнянні" : "+ Порівняти"}</button>
                    </div>
                  </div>
                  <div className="score-dial">{r.score != null ? <Dial score={r.score} /> : "—"}<span className="small muted">бал з 100</span></div>
                </article>
              );
            })}
            {data && !data.ranked.length && <div className="empty"><b>Жодне авто не проходить обов’язкові умови</b><span>Збільште бюджет або змініть коробку, привід чи паливо.</span></div>}
          </div>
          {data && data.excluded.length > 0 && (
            <details><summary>Не пройшли обов’язкові умови ({data.excluded_total}{data.excluded_total > data.excluded.length ? `, показано ${data.excluded.length}` : ""})</summary>
              <div className="tbl-wrap" style={{ marginTop: 10 }}><table>
                <thead><tr><th>Модифікація</th><th>Причина</th></tr></thead>
                <tbody>{data.excluded.map((x) => <tr key={x.slug}><td>{x.name}</td><td className="small">{x.reasons.join("; ")}</td></tr>)}</tbody>
              </table></div>
            </details>
          )}
        </section>
      </div>
    </>
  );
}

export default function RatingPage() {
  return <Suspense fallback={<p className="loading">Завантаження…</p>}><Rating /></Suspense>;
}
