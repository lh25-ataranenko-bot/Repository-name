"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CarPicker } from "@/components/CarPicker";
import { ScoreBars } from "@/components/ScoreBars";
import { api } from "@/lib/api";
import { COLORS, nameOf, shortOf, usd } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { CompareResult } from "@/lib/types";

function Compare() {
  const { compare, setCompare, toggleCompare, years, setYear, user, toast, ready } = useStore();
  const [data, setData] = useState<CompareResult | null>(null);
  const [group, setGroup] = useState("all");
  const [hideSame, setHideSame] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const params = useSearchParams();
  useEffect(() => {
    const add = params.get("add")?.split(",").filter(Boolean) ?? [];
    if (ready && add.length) setCompare([...new Set([...add, ...compare])].slice(0, 5));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  useEffect(() => {
    if (!ready || compare.length < 2) return setData(null);
    const chosen = Object.fromEntries(compare.filter((s) => years[s]).map((s) => [s, years[s]]));
    api<CompareResult>("/api/compare", { method: "POST", json: { slugs: compare, years: chosen } })
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(e.message));
  }, [compare, ready, years]);

  const move = (i: number, d: number) => {
    const L = [...compare];
    [L[i], L[i + d]] = [L[i + d], L[i]];
    setCompare(L);
  };
  const save = async () => {
    if (!user) return toast("Увійдіть у кабінет, щоб зберігати порівняння");
    await api("/api/me/comparisons", { method: "POST", json: { name: data!.cars.map((c) => c.model).join(" vs "), slugs: compare } });
    toast("Порівняння збережено в кабінеті");
  };

  const picker = (
    <div className="row"><label htmlFor="addCar">Додати авто</label>
      <CarPicker id="addCar" exclude={compare} placeholder="Пошук: марка, модель, двигун" onChange={(s) => toggleCompare(s)} /></div>
  );
  const head = (
    <div className="page-head"><p className="eyebrow">Порівняння · {compare.length} з 5</p><h1>Порівняння модифікацій</h1>
      <p>Найкраще значення в рядку виділене. Якщо характеристики немає, показано «Немає даних»: значення іншої версії ми не підставляємо.</p></div>
  );
  if (ready && compare.length < 2) {
    return <>{head}<div className="empty"><b>Для порівняння потрібно щонайменше 2 автомобілі</b><span>Зараз обрано: {compare.length}. Додайте модифікації з каталогу або зі списку нижче.</span>{picker}<Link className="btn" href="/catalog">Відкрити каталог</Link></div></>;
  }
  if (error) return <>{head}<p className="err">{error}</p></>;
  if (!data) return <>{head}<p className="loading">Завантаження порівняння…</p></>;
  const cars = data.cars;

  return (
    <>
      {head}
      <div className="stack">
        <div className="spread">
          <div className="chips" role="group" aria-label="Категорії">
            {["all", ...data.table.map((g) => g.group)].map((g) => (
              <button key={g} className="chip" aria-pressed={group === g} onClick={() => setGroup(g)}>{g === "all" ? "Усе" : g}</button>
            ))}
          </div>
          <label className="check"><input type="checkbox" checked={hideSame} onChange={(e) => setHideSame(e.target.checked)} /> Приховати однакові</label>
        </div>
        <div className="tbl-wrap">
          <table className="cmp">
            <thead><tr><th>Характеристика</th>{cars.map((c, i) => (
              <th key={c.slug}><div className="colhead">
                <span className="row" style={{ gap: 6 }}><span className="dot" style={{ background: COLORS[i] }} /><span className="nm">{c.brand} {shortOf(c)}</span></span>
                {c.year_from && c.year_to && (
                  <select aria-label={`Рік випуску ${c.brand} ${shortOf(c)}`} value={c.for_year ?? ""} style={{ width: "auto", padding: "3px 6px", fontSize: 13 }}
                    onChange={(e) => setYear(c.slug, e.target.value ? Number(e.target.value) : null)}>
                    <option value="">Рік ціни: {c.year_ref}</option>
                    {Array.from({ length: c.year_to - c.year_from + 1 }, (_, k) => c.year_from! + k).map((y) => <option key={y} value={y}>Авто {y} року</option>)}
                  </select>
                )}
                <span className="tools">
                  <button className="icon-btn btn-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Посунути ліворуч">←</button>
                  <button className="icon-btn btn-sm" disabled={i === cars.length - 1} onClick={() => move(i, 1)} aria-label="Посунути праворуч">→</button>
                  <Link className="icon-btn btn-sm btn" href={`/cars/${c.slug}`}>Деталі</Link>
                  <button className="icon-btn btn-sm" onClick={() => toggleCompare(c.slug)} aria-label="Прибрати">×</button>
                </span></div></th>
            ))}</tr></thead>
            <tbody>
              {data.table.filter((g) => group === "all" || g.group === group).map((g) => {
                const rows = g.rows.filter((r) => !(hideSame && r.same));
                if (!rows.length) return null;
                return [
                  <tr className="grp" key={g.group}><th colSpan={cars.length + 1}>{g.group}</th></tr>,
                  ...rows.map((r) => (
                    <tr key={g.group + r.label}><th scope="row">{r.label}</th>
                      {r.values.map((v, i) => <td key={i} className={r.best.includes(i) ? "best" : ""}>{v ?? <span className="nd">Немає даних</span>}</td>)}</tr>
                  )),
                ];
              })}
            </tbody>
          </table>
        </div>
        <div className="spread">{picker}<div className="row"><button onClick={save}>Зберегти порівняння</button><Link className="btn" href="/tco">Порахувати витрати →</Link></div></div>
      </div>
      <section className="split" style={{ marginTop: 36 }}>
        <div className="panel stack">
          <h3>Оцінки за категоріями</h3>
          <div className="legend">{cars.map((c, i) => <span key={c.slug}><span className="dot" style={{ background: COLORS[i] }} />{shortOf(c)}</span>)}</div>
          <ScoreBars series={cars.map((c, i) => ({ color: COLORS[i], scores: c.scores }))} />
        </div>
        <div className="panel stack">
          <h3>Підсумок</h3>
          {(() => {
            const w = cars.find((c) => c.slug === data.winner)!;
            const ws = data.summary.find((s) => s.slug === data.winner)!;
            return <div className="notice info">За рівних ваг категорій найвищий загальний бал у <b>{nameOf(w)}</b>: {ws.score}/100. Змінити пріоритети можна в розділі <Link href="/rating">Рейтинг</Link>.</div>;
          })()}
          {data.summary.map((s, i) => (
            <div className="stack" style={{ gap: 4 }} key={s.slug}>
              <div className="row" style={{ gap: 8 }}><span className="dot" style={{ background: COLORS[i] }} /><b>{nameOf(cars[i])}</b><span className="pill plain">{s.score ?? "—"}/100</span></div>
              <ul className="reasons" style={{ margin: 0 }}>
                {s.leads.length > 0 && <li>Найкраще серед обраних: {s.leads.join(", ")}</li>}
                {s.weak.length > 0 && <li className="minus">Найслабше: {s.weak.join(", ")}</li>}
                <li className="note">5 років володіння: {s.tco_5y != null ? usd(s.tco_5y) : "немає даних"}</li>
              </ul>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

export default function ComparePage() {
  return <Suspense fallback={<p className="loading">Завантаження…</p>}><Compare /></Suspense>;
}
