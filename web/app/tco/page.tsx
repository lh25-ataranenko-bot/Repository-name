"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CarPicker } from "@/components/CarPicker";
import { api } from "@/lib/api";
import { COLORS, nf, usd, yearsWord } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Env, TcoInputs, TcoNumbers, TcoResponse } from "@/lib/types";

const SEG: [keyof TcoNumbers, string, string][] = [
  ["depreciation", "Знецінення (P − S)", "var(--s1)"], ["F", "Пальне / енергія", "var(--s2)"], ["M", "Планове ТО", "var(--s3)"],
  ["R", "Ремонти", "var(--s4)"], ["I", "Страхування", "var(--s5)"], ["O", "Інші витрати", "var(--s6)"],
];
const FIELDS: [keyof TcoInputs, string, number][] = [
  ["price", "Ціна купівлі, $", 100], ["cons", "Витрата на 100 км", 0.1], ["maint", "ТО, $/рік", 10],
  ["repair", "Ремонти, $/рік", 10], ["ins", "Страхування, $/рік", 10], ["dep_pct", "Знецінення, %/рік", 0.5],
];
const DEFAULT_ENV: Env = { petrol: 58.5, diesel: 55.9, kwh: 4.32, rate: 41.6, km: 15000, years: 5, other: 250 };

function Tco() {
  const { compare, setCompare, toggleCompare, ready } = useStore();
  const params = useSearchParams();
  const [env, setEnv] = useState<Env>(DEFAULT_ENV);
  const [ov, setOv] = useState<Record<string, Partial<TcoInputs>>>({});
  const [data, setData] = useState<TcoResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const add = params.get("add");
    if (ready && add && !compare.includes(add)) setCompare([...compare.slice(0, 4), add]);
    const price = Number(params.get("price"));
    if (add && price > 0) setOv((o) => ({ ...o, [add]: { ...(o[add] ?? {}), price } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (!ready || !compare.length) return setData(null);
    const t = setTimeout(() => {
      const overrides = Object.fromEntries(Object.entries(ov).filter(([s]) => compare.includes(s)));
      api<TcoResponse>("/api/tco", { method: "POST", json: { slugs: compare, env, overrides } })
        .then((d) => { setData(d); setError(null); }).catch((e) => setError(e.message));
    }, 200);
    return () => clearTimeout(t);
  }, [compare, env, ov, ready]);

  const envField = (k: keyof Env, label: string, step: number) => (
    <div className="field"><label htmlFor={`e-${k}`}>{label}</label>
      <input id={`e-${k}`} type="number" min={0} step={step} defaultValue={env[k]}
        onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v >= 0) setEnv({ ...env, [k]: v }); }} /></div>
  );
  const picker = <div className="row"><label htmlFor="tcoAdd">Додати авто</label><CarPicker id="tcoAdd" exclude={compare} placeholder="Пошук: марка, модель, двигун" onChange={toggleCompare} /></div>;
  const yw = `${env.years} ${yearsWord(env.years)}`;
  const max = Math.max(1, ...(data?.results ?? []).map((r) => (r.result ? SEG.reduce((s, [k]) => s + Math.max(0, r.result![k] as number), 0) : 0)));
  const byName = (slug: string) => data?.results.find((r) => r.slug === slug)?.name;

  return (
    <>
      <div className="page-head"><p className="eyebrow">Калькулятор вартості володіння</p><h1>Скільки насправді коштує авто</h1>
        <p>Розрахунок за однакових умов для всіх автомобілів зі списку порівняння. Усі припущення можна змінити.</p></div>
      <div className="formula">TCO = P + F + M + R + I + O − S &nbsp;·&nbsp; F = (D × C / 100) × Q</div>
      <p className="small muted" style={{ marginTop: 6 }}>P — ціна купівлі; F — пальне; D — пробіг за період; C — витрата; Q — ціна пального; M — ТО; R — ремонти; I — страхування; O — інші витрати; S — прогнозована ціна перепродажу, S = P × (1 − d)<sup>роки</sup>.</p>
      <div className="panel stack" style={{ marginTop: 18 }}>
        <div className="row" role="group" aria-label="Строк володіння"><span className="label">Строк володіння:</span>
          {[1, 3, 5, 10].map((y) => <button key={y} className="chip" aria-pressed={env.years === y} onClick={() => setEnv({ ...env, years: y })}>{y} {yearsWord(y)}</button>)}</div>
        <div className="fields">
          {envField("km", "Пробіг за рік, км", 1000)}{envField("petrol", "Бензин А-95, грн/л", 0.1)}{envField("diesel", "Дизель, грн/л", 0.1)}
          {envField("kwh", "Електроенергія, грн/кВт·год", 0.01)}{envField("rate", "Курс, грн за $", 0.1)}{envField("other", "Інші витрати, $/рік", 10)}
        </div>
        <p className="small muted">Інші витрати: паркування, мийка, шини, податки. Ціни на пальне типові для жовтня 2026 р., замініть на свої.</p>
      </div>

      {ready && !compare.length ? (
        <div className="empty" style={{ marginTop: 24 }}><b>Оберіть хоча б один автомобіль</b>{picker}</div>
      ) : (
        <>
          <section className="stack" style={{ marginTop: 26 }}>
            <div className="spread"><h2>Результат</h2>{picker}</div>
            {error && <p className="err">{error}</p>}
            {data?.comparison && (
              <div className="notice info">За {yw} і {nf(env.km)} км на рік найдешевше обійдеться <b>{byName(data.comparison.cheapest)}</b>. Це на <b>{usd(data.comparison.difference)}</b> менше, ніж {byName(data.comparison.most_expensive)}.</div>
            )}
            {data && data.results.length === 1 && <div className="notice info">Додайте ще одне авто, щоб побачити фінансову різницю за однакових умов.</div>}
            {data?.missing.length ? <div className="notice">Не вистачає даних для розрахунку: {data.missing.map(byName).join(", ")}. Заповніть порожні поля в припущеннях.</div> : null}
            <div className="panel stack">
              <div className="legend">{SEG.map(([k, l, c]) => <span key={k}><span className="dot" style={{ background: c }} />{l}</span>)}</div>
              {data?.results.map((r, i) => (
                <div className="tco-row" key={r.slug}>
                  <span className="row" style={{ gap: 6, minWidth: 0 }}><span className="dot" style={{ background: COLORS[i] }} /><span className="small" style={{ overflowWrap: "anywhere" }}>{r.name}</span></span>
                  <div className="stacked" role="img" aria-label={`Структура витрат ${r.name}`}>
                    {r.result && SEG.map(([k, l, c]) => (r.result![k] as number) > 0 && <i key={k} title={`${l}: ${usd(r.result![k] as number)}`} style={{ width: `${((r.result![k] as number) / max) * 100}%`, background: c }} />)}
                  </div>
                  <b className="num" style={{ textAlign: "right" }}>{r.result ? usd(r.result.total) : "—"}</b>
                </div>
              ))}
            </div>
            {data && (
              <div className="tbl-wrap"><table>
                <thead><tr><th>За {yw}</th>{data.results.map((r) => <th className="n" key={r.slug}>{r.name}</th>)}</tr></thead>
                <tbody>
                  {([["P — ціна купівлі", "P"], ["F — пальне / енергія", "F"], ["M — планове ТО", "M"], ["R — ремонти", "R"], ["I — страхування", "I"], ["O — інші витрати", "O"]] as [string, keyof TcoNumbers][]).map(([l, k]) => (
                    <tr key={k}><th scope="row">{l}</th>{data.results.map((r) => <td className="n" key={r.slug}>{r.result ? usd(r.result[k] as number) : "—"}</td>)}</tr>
                  ))}
                  <tr><th scope="row">S — ціна перепродажу</th>{data.results.map((r) => <td className="n" key={r.slug}>{r.result ? "−" + usd(r.result.S) : "—"}</td>)}</tr>
                  <tr><th scope="row"><b>TCO, разом</b></th>{data.results.map((r) => <td className="n" key={r.slug}><b>{r.result ? usd(r.result.total) : "—"}</b></td>)}</tr>
                  <tr><th scope="row">На місяць</th>{data.results.map((r) => <td className="n" key={r.slug}>{r.result ? usd(r.result.per_month) : "—"}</td>)}</tr>
                  <tr><th scope="row">На 1 км</th>{data.results.map((r) => <td className="n" key={r.slug}>{r.result ? <>${nf(r.result.per_km, 2)} <span className="muted small">({nf(r.result.per_km * env.rate, 1)} грн)</span></> : "—"}</td>)}</tr>
                </tbody>
              </table></div>
            )}
          </section>
          {data && (
            <section className="stack" style={{ marginTop: 26 }}>
              <div className="spread"><h3>Припущення для кожного авто</h3><button className="btn-ghost" onClick={() => setOv({})}>Повернути типові значення</button></div>
              <div className="tbl-wrap"><table>
                <thead><tr><th>Параметр</th>{data.results.map((r, i) => <th key={r.slug}><span className="row" style={{ gap: 6 }}><span className="dot" style={{ background: COLORS[i] }} />{r.name}</span></th>)}</tr></thead>
                <tbody>{FIELDS.map(([k, l, step]) => (
                  <tr key={k}><th scope="row" className="small">{l}</th>{data.results.map((r) => {
                    const val = ov[r.slug]?.[k] ?? r.defaults[k];
                    return (
                      <td key={r.slug} style={{ minWidth: 130 }}>
                        <input type="number" step={step} min={0} value={val ?? ""} placeholder="Немає даних" aria-label={`${l} — ${r.name}`}
                          onChange={(e) => {
                            const o = { ...(ov[r.slug] ?? {}) };
                            if (e.target.value === "") delete o[k];
                            else o[k] = parseFloat(e.target.value);
                            setOv({ ...ov, [r.slug]: o });
                          }} />
                        {k === "cons" && <span className="small muted">{r.unit}{!r.consumption_real && ov[r.slug]?.cons == null ? " · паспортна" : ""}</span>}
                      </td>
                    );
                  })}</tr>
                ))}</tbody>
              </table></div>
              <p className="small muted">Типові значення взято з каталогу. Страхування за замовчуванням: 3 % від ціни на рік. Ремонти — середня оцінка для цієї модифікації.</p>
            </section>
          )}
        </>
      )}
    </>
  );
}

export default function TcoPage() {
  return <Suspense fallback={<p className="loading">Завантаження…</p>}><Tco /></Suspense>;
}
