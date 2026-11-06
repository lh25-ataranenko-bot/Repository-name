"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CarPicker } from "@/components/CarPicker";
import { api } from "@/lib/api";
import { MIN_YEAR, nf, thisYear, usd } from "@/lib/format";
import type { Car, CheckResponse } from "@/lib/types";

const CURRENT_YEAR = thisYear();

function Check() {
  const p = useSearchParams();
  const [form, setForm] = useState({ slug: p.get("slug") ?? "vw-passat-b8-20tdi", year: 2017, km: 198000, price: 13900, condition: "good", vin: "WVWZZZ3CZHE000000" });
  const [data, setData] = useState<CheckResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});

  // Picking another modification resets the form to that car's typical values.
  const pick = async (slug: string, wantYear?: number) => {
    const c = await api<Car>(`/api/cars/${slug}`);
    const year = wantYear && c.years?.includes(wantYear) ? wantYear : c.year_ref ?? c.year_from ?? CURRENT_YEAR;
    setForm({ slug, year, km: 15000 * (CURRENT_YEAR - year), price: c.price_by_year?.[String(year)] ?? c.price ?? 0, condition: "good", vin: "" });
    setDone({});
  };
  useEffect(() => {
    if (p.get("slug")) pick(p.get("slug")!, Number(p.get("year")) || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    let stale = false; // an older, slower answer must not overwrite a newer one
    const t = setTimeout(() => api<CheckResponse>("/api/check", { method: "POST", json: form })
      .then((d) => { if (!stale) { setData(d); setError(null); } }).catch((e) => { if (!stale) setError(e.message); }), 250);
    return () => { stale = true; clearTimeout(t); };
  }, [form]);

  const num = (k: "year" | "km" | "price") => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: +e.target.value || 0 });
  const all = data ? [...data.checklist.general, ...data.checklist.specific, ...data.checklist.issues] : [];
  const doneN = all.filter((x) => done[x]).length;
  const item = (t: string) => (
    <li key={t}><label><input type="checkbox" checked={!!done[t]} onChange={(e) => setDone({ ...done, [t]: e.target.checked })} /><span>{t}</span></label></li>
  );

  let range = null;
  if (data?.market && data.verdict) {
    const m = data.market;
    const lo = Math.min(m.low, form.price) * 0.9, hi = Math.max(m.high, form.price) * 1.1;
    const pos = (v: number) => ((v - lo) / (hi - lo)) * 100;
    range = (
      <div className="range" aria-hidden="true"><div className="axis" />
        <div className="band" style={{ left: `${pos(m.low)}%`, width: `${pos(m.high) - pos(m.low)}%` }} />
        <div className="mark" style={{ left: `${pos(m.value)}%` }} /><div className="mark ask" style={{ left: `${pos(form.price)}%` }} /></div>
    );
  }

  return (
    <>
      <div className="page-head"><p className="eyebrow">Аналіз автомобіля перед купівлею</p><h1>Перевірте оголошення</h1>
        <p>Оберіть модифікацію з оголошення й вкажіть рік, пробіг і ціну. Сервіс зіставить ціну з аналогами, покаже типові проблеми й складе чекліст огляду.</p></div>
      <div className="split" style={{ gridTemplateColumns: "minmax(0,.9fr) minmax(0,1.1fr)" }}>
        <form className="panel stack" onSubmit={(e) => e.preventDefault()}>
          <div className="field"><label htmlFor="c-id">Модифікація</label><CarPicker id="c-id" value={form.slug} onChange={(s) => pick(s)} /></div>
          <div className="fields">
            <div className="field"><label htmlFor="c-year">Рік випуску</label><input id="c-year" type="number" min={MIN_YEAR} max={CURRENT_YEAR + 1} value={form.year} onChange={num("year")} /></div>
            <div className="field"><label htmlFor="c-km">Пробіг, км</label><input id="c-km" type="number" min={0} step={1000} value={form.km} onChange={num("km")} /></div>
            <div className="field"><label htmlFor="c-price">Ціна в оголошенні, $</label><input id="c-price" type="number" min={0} step={100} value={form.price} onChange={num("price")} /></div>
            <div className="field"><label htmlFor="c-cond">Заявлений стан</label>
              <select id="c-cond" value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })}>
                <option value="excellent">Відмінний</option><option value="good">Добрий</option><option value="needs">Потребує вкладень</option></select></div>
          </div>
          <div className="field"><label htmlFor="c-vin">VIN (необов’язково)</label><input id="c-vin" className="mono" maxLength={20} value={form.vin} autoComplete="off" spellCheck={false} onChange={(e) => setForm({ ...form, vin: e.target.value })} /></div>
          {data?.vin && (
            <div><span className="label">Перевірка VIN</span><ul className="reasons">
              {data.vin.errors.map((e) => <li className="minus" key={e}>{e}</li>)}
              {data.vin.notes.map((e) => <li className="note" key={e}>{e}</li>)}
            </ul></div>
          )}
          <div className="notice">{data?.disclaimer ?? "VIN не гарантує повної історії автомобіля."}</div>
        </form>
        <section className="stack" style={{ minWidth: 0 }}>
          {error && <p className="err">{error}</p>}
          {data?.warnings.map((w) => <div className="notice" key={w}>{w}</div>)}
          {data && (data.verdict && data.market ? (
            <div className={`verdict ${data.verdict.level}`}>
              <div className="spread"><h3>{data.verdict.title}</h3><span className={`pill ${data.verdict.level}`}>{data.verdict.diff_pct > 0 ? "+" : ""}{nf(data.verdict.diff_pct, 1)} %</span></div>
              <p>{data.verdict.text}</p>
              {range}
              <div className="spread small"><span>Оцінка ринку: <b>{usd(data.market.value)}</b> (діапазон {usd(data.market.low)}–{usd(data.market.high)})</span>
                <span><span className="dot" style={{ background: "var(--needle)" }} /> ціна в оголошенні {usd(form.price)}</span></div>
              <p className="small muted">Очікуваний пробіг для {form.year} р.: {nf(data.market.expected_km)} км. Поправка за пробіг: {data.market.mileage_adj > 0 ? "+" : ""}{nf(data.market.mileage_adj * 100, 1)} %. Базова ціна: {usd(data.car.price)} за {data.car.year_ref} р.</p>
            </div>
          ) : <div className="notice">Немає даних для оцінки ціни цієї модифікації.</div>)}
          {data && (
            <div className="panel stack">
              <div className="spread"><h3>Чекліст огляду</h3><span className="pill info">{doneN} з {all.length}</span></div>
              <div className="bar"><i style={{ width: `${all.length ? (doneN / all.length) * 100 : 0}%` }} /></div>
              <div><span className="label">Загальна перевірка</span><ul className="checklist">{data.checklist.general.map(item)}</ul></div>
              {data.checklist.specific.length > 0 && <div><span className="label">Для цієї модифікації</span><ul className="checklist">{data.checklist.specific.map(item)}</ul></div>}
              <div><span className="label">Типові несправності {data.car.name}</span><ul className="checklist">{data.checklist.issues.map(item)}</ul></div>
            </div>
          )}
          {data && <div className="panel stack"><h3>Запитання продавцю</h3><ul className="reasons" style={{ margin: 0 }}>{data.checklist.questions.map((q) => <li className="note" key={q}>{q}</li>)}</ul></div>}
        </section>
      </div>
    </>
  );
}

export default function CheckPage() {
  return <Suspense fallback={<p className="loading">Завантаження…</p>}><Check /></Suspense>;
}
