"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CarCard } from "@/components/CarCard";
import { api } from "@/lib/api";
import { BODY, DRIVE, FUEL } from "@/lib/format";
import { ModelYearFields } from "@/components/ModelYearFields";
import type { Car } from "@/lib/types";

const PAGE = 48;
const INIT = { q: "", brand: "", model: "", year: "", body: "any", fuel: "any", trans: "any", drive: "any", max_price: "", sort: "reliability" };

export default function Catalog() {
  const [f, setF] = useState(INIT);
  const [data, setData] = useState<{ total: number; count: number; items: Car[] } | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
  }, []);
  useEffect(() => {
    const p = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => v && v !== "any" && p.set(k, v));
    p.set("limit", String(PAGE));
    const t = setTimeout(() => api<typeof data>(`/api/cars?${p}`).then((d) => { setData(d); setError(null); }).catch((e) => setError(e.message)), 150);
    return () => clearTimeout(t);
  }, [f]);

  const loadMore = async () => {
    if (!data) return;
    setMore(true);
    const p = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => v && v !== "any" && p.set(k, v));
    p.set("limit", String(PAGE));
    p.set("offset", String(data.items.length));
    try {
      const next = await api<NonNullable<typeof data>>(`/api/cars?${p}`);
      setData({ ...next, items: [...data.items, ...next.items] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMore(false);
    }
  };

  const set = (k: keyof typeof INIT) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const sel = (id: string, label: string, k: keyof typeof INIT, opts: [string, string][]) => (
    <div className="field"><label htmlFor={id}>{label}</label><select id={id} value={f[k]} onChange={set(k)}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
  );

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">Каталог · {data?.total ?? "…"} модифікацій</p>
        <h1>Каталог автомобілів</h1>
        <p>Марка → модель → покоління → модифікація. Різні двигуни й коробки однієї моделі показані окремо, бо можуть суттєво відрізнятися за витратами й надійністю.</p>
      </div>
      <div className="side-layout">
        <aside className="panel stack">
          <div className="field"><label htmlFor="f-q">Пошук</label><input id="f-q" placeholder="Модель, покоління, код двигуна" value={f.q} onChange={set("q")} /></div>
          <ModelYearFields idPrefix="f" value={{ brand: f.brand, model: f.model, year: f.year }} onChange={(v) => setF({ ...f, ...v })} />
          {f.brand && f.model && <Link className="btn btn-sm" href={`/models/${encodeURIComponent(f.brand)}/${encodeURIComponent(f.model)}`}>Сторінка моделі {f.model}: усі покоління</Link>}
          {f.year && <p className="small muted">Показано модифікації, що випускалися у {f.year} році, з оцінкою ціни саме для цього року.</p>}
          {sel("f-body", "Кузов", "body", [["any", "Будь-який"], ...Object.entries(BODY)])}
          {sel("f-fuel", "Паливо", "fuel", [["any", "Будь-яке"], ...Object.entries(FUEL)])}
          {sel("f-trans", "Коробка", "trans", [["any", "Будь-яка"], ["automatic", "Автоматична"], ["manual", "Механіка"]])}
          {sel("f-drive", "Привід", "drive", [["any", "Будь-який"], ...Object.entries(DRIVE)])}
          <div className="field"><label htmlFor="f-max">Максимальна ціна, $</label><input id="f-max" type="number" min={0} step={500} placeholder="Без обмеження" value={f.max_price} onChange={set("max_price")} /></div>
          <button className="btn-ghost" onClick={() => setF(INIT)}>Скинути фільтри</button>
        </aside>
        <section className="stack" style={{ minWidth: 0 }}>
          <div className="spread">
            <p className="muted">{data ? `Знайдено: ${data.count} з ${data.total}` : "Завантаження…"}</p>
            <div className="row">
              <label htmlFor="f-sort">Сортувати</label>
              <select id="f-sort" value={f.sort} onChange={set("sort")} style={{ width: "auto" }}>
                {[["reliability", "Надійність"], ["price", "Ціна: спершу дешевші"], ["hp", "Потужність"], ["acc", "Розгін 0–100"], ["cost", "Вартість 100 км"], ["tco", "Вартість володіння 5 р."]].map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          {error && <p className="err">{error}</p>}
          <div className="cards">
            {data?.items.map((c) => <CarCard key={c.slug} car={c} />)}
            {data && !data.items.length && (
              <div className="empty" style={{ gridColumn: "1/-1" }}><b>Нічого не знайдено</b><span>Послабте фільтри або збільште максимальну ціну.</span><button onClick={() => setF(INIT)}>Скинути фільтри</button></div>
            )}
          </div>
          {data && data.items.length < data.count && (
            <div className="row" style={{ justifyContent: "center" }}>
              <button onClick={loadMore} disabled={more}>{more ? "Завантаження…" : `Показати ще (показано ${data.items.length} з ${data.count})`}</button>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
