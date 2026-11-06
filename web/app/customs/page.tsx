"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CarPicker } from "@/components/CarPicker";
import { PrintButton } from "@/components/PrintButton";
import { api } from "@/lib/api";
import { MIN_YEAR, nf, thisYear } from "@/lib/format";
import type { Car } from "@/lib/types";

interface Money { uah: number; usd: number; eur: number }
interface Result {
  customs_value: Money; customs_total: Money; total: Money; age_coefficient: number | null;
  lines: (Money & { key: string; label: string; how: string })[];
}
const RATE_FIELDS: [string, string, number][] = [
  ["duty_pct", "Ввізне мито, %", 10], ["vat_pct", "ПДВ, %", 20],
  ["petrol_eur_per_l", "Акциз бензин до 3 л, € за 1 л об’єму", 50], ["petrol_big_eur_per_l", "Акциз бензин понад 3 л, €", 100],
  ["diesel_eur_per_l", "Акциз дизель до 3,5 л, € за 1 л", 75], ["diesel_big_eur_per_l", "Акциз дизель понад 3,5 л, €", 150],
  ["hybrid_eur", "Акциз гібрид, € за авто", 100], ["electric_eur_per_kwh", "Акциз електро, € за 1 кВт·год", 1],
  ["subsistence_minimum_uah", "Прожитковий мінімум для збору до ПФ, грн", 3028],
];
const CURRENT_YEAR = thisYear();

function Customs() {
  const params = useSearchParams();
  const [slug, setSlug] = useState(params.get("slug") ?? "");
  const [form, setForm] = useState({
    price: 12000, currency: "USD", delivery: 1800, production_year: 2018, fuel: "petrol", cc: 2000, battery_kwh: 64,
    eu_origin: false, eur_uah: 45.5, usd_uah: 41.6, include_pension: true,
  });
  const [rates, setRates] = useState<Record<string, number>>(Object.fromEntries(RATE_FIELDS.map(([k, , v]) => [k, v])));
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Prefill from a catalogue modification: fuel, engine volume, battery, production year.
  useEffect(() => {
    if (!slug) return;
    api<Car>(`/api/cars/${slug}`).then((c) => {
      const y = Number(params.get("year"));
      setForm((f) => ({
        ...f, fuel: c.fuel, cc: c.displacement ?? f.cc, battery_kwh: c.battery ?? f.battery_kwh,
        production_year: y && c.years?.includes(y) ? y : c.year_ref ?? f.production_year,
      }));
    }).catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    let stale = false; // an older, slower answer must not overwrite a newer one
    const t = setTimeout(() => {
      const body = { ...form, cc: form.fuel === "petrol" || form.fuel === "diesel" ? form.cc : null,
        battery_kwh: form.fuel === "electric" ? form.battery_kwh : null, rates };
      api<Result>("/api/customs", { method: "POST", json: body }).then((d) => { if (!stale) { setData(d); setError(null); } }).catch((e) => { if (!stale) setError(e.message); });
    }, 250);
    return () => { stale = true; clearTimeout(t); };
  }, [form, rates]);

  const num = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: Number(e.target.value) });
  const cur = form.currency === "EUR" ? "€" : "$";

  return (
    <>
      <div className="page-head"><p className="eyebrow">Калькулятор розмитнення</p><h1>Скільки коштує розмитнити авто</h1>
        <p>Орієнтовний розрахунок для легкового авто, ввезеного зі США чи Європи: мито, акциз, ПДВ і збір до Пенсійного фонду при першій реєстрації.</p></div>
      <div className="split" style={{ gridTemplateColumns: "minmax(0,.9fr) minmax(0,1.1fr)" }}>
        <form className="panel stack" onSubmit={(e) => e.preventDefault()}>
          <div className="field"><label htmlFor="cu-car">Модифікація з каталогу (необов’язково)</label>
            <CarPicker id="cu-car" value={slug} onChange={setSlug} placeholder="Пошук: марка, модель, двигун" /></div>
          <div className="fields">
            <div className="field"><label htmlFor="cu-price">Ціна авто</label><input id="cu-price" type="number" min={1} step={100} value={form.price} onChange={num("price")} /></div>
            <div className="field"><label htmlFor="cu-cur">Валюта</label><select id="cu-cur" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}><option value="USD">Долар США</option><option value="EUR">Євро</option></select></div>
            <div className="field"><label htmlFor="cu-del">Доставка до кордону, {cur}</label><input id="cu-del" type="number" min={0} step={50} value={form.delivery} onChange={num("delivery")} /></div>
            <div className="field"><label htmlFor="cu-year">Рік випуску</label><input id="cu-year" type="number" min={MIN_YEAR} max={CURRENT_YEAR} value={form.production_year} onChange={num("production_year")} /></div>
            <div className="field"><label htmlFor="cu-fuel">Двигун</label><select id="cu-fuel" value={form.fuel} onChange={(e) => setForm({ ...form, fuel: e.target.value })}>
              <option value="petrol">Бензин</option><option value="diesel">Дизель</option><option value="hybrid">Гібрид</option><option value="electric">Електро</option></select></div>
            {(form.fuel === "petrol" || form.fuel === "diesel") && <div className="field"><label htmlFor="cu-cc">Об’єм двигуна, см³</label><input id="cu-cc" type="number" min={500} max={9000} step={1} value={form.cc} onChange={num("cc")} /></div>}
            {form.fuel === "electric" && <div className="field"><label htmlFor="cu-kwh">Ємність батареї, кВт·год</label><input id="cu-kwh" type="number" min={1} max={250} step={0.1} value={form.battery_kwh} onChange={num("battery_kwh")} /></div>}
            <div className="field"><label htmlFor="cu-eur">Курс євро, грн</label><input id="cu-eur" type="number" min={1} step={0.1} value={form.eur_uah} onChange={num("eur_uah")} /></div>
            <div className="field"><label htmlFor="cu-usd">Курс долара, грн</label><input id="cu-usd" type="number" min={1} step={0.1} value={form.usd_uah} onChange={num("usd_uah")} /></div>
          </div>
          <label className="check"><input type="checkbox" checked={form.eu_origin} onChange={(e) => setForm({ ...form, eu_origin: e.target.checked })} /> Авто виготовлене в ЄС і є сертифікат EUR.1 (мито 0 %)</label>
          <label className="check"><input type="checkbox" checked={form.include_pension} onChange={(e) => setForm({ ...form, include_pension: e.target.checked })} /> Враховувати збір до Пенсійного фонду</label>
          <details>
            <summary>Ставки (змініть, якщо законодавство оновилося)</summary>
            <div className="fields" style={{ marginTop: 10 }}>
              {RATE_FIELDS.map(([k, l]) => (
                <div className="field" key={k}><label htmlFor={`cr-${k}`}>{l}</label>
                  <input id={`cr-${k}`} type="number" min={0} step="any" value={rates[k]} onChange={(e) => setRates({ ...rates, [k]: Number(e.target.value) })} /></div>
              ))}
            </div>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setRates(Object.fromEntries(RATE_FIELDS.map(([k, , v]) => [k, v])))}>Повернути типові ставки</button>
          </details>
        </form>
        <section className="stack" style={{ minWidth: 0 }}>
          {error && <div className="notice">{error}</div>}
          {data && (
            <>
              <div className="stats">
                <div className="stat"><span className="label">Розмитнення</span><span className="big-num">{nf(data.customs_total.uah)} грн</span><span className="small muted">≈ ${nf(data.customs_total.usd)} · €{nf(data.customs_total.eur)}</span></div>
                <div className="stat"><span className="label">Авто з доставкою й розмитненням</span><span className="big-num">{nf(data.total.uah)} грн</span><span className="small muted">≈ ${nf(data.total.usd)} · €{nf(data.total.eur)}</span></div>
              </div>
              <div className="tbl-wrap"><table>
                <thead><tr><th>Платіж</th><th>Як рахується</th><th className="n">Грн</th><th className="n">$</th></tr></thead>
                <tbody>
                  <tr><td>Митна вартість (ціна + доставка)</td><td className="small muted">за курсом {form.currency === "EUR" ? form.eur_uah : form.usd_uah} грн</td><td className="n">{nf(data.customs_value.uah)}</td><td className="n">{nf(data.customs_value.usd)}</td></tr>
                  {data.lines.map((l) => (
                    <tr key={l.key}><td>{l.label}</td><td className="small muted">{l.how}</td><td className="n">{nf(l.uah)}</td><td className="n">{nf(l.usd)}</td></tr>
                  ))}
                  <tr><td><b>Разом до сплати при розмитненні</b></td><td /><td className="n"><b>{nf(data.customs_total.uah)}</b></td><td className="n"><b>{nf(data.customs_total.usd)}</b></td></tr>
                </tbody>
              </table></div>
              <PrintButton />
              <div className="notice">Розрахунок орієнтовний. Ставки, пільги для електромобілів і правила походження змінюються: перед купівлею звірте їх з Державною митною службою або митним брокером. Не враховано послуги брокера, сертифікацію, страхування та реєстрацію в сервісному центрі МВС.</div>
            </>
          )}
        </section>
      </div>
    </>
  );
}

export default function CustomsPage() {
  return <Suspense fallback={<p className="loading">Завантаження…</p>}><Customs /></Suspense>;
}
