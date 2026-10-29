"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { STATUS } from "@/lib/format";
import { useStore } from "@/lib/store";

interface Quality {
  total: number;
  counts: Record<string, number>;
  items: { slug: string; name: string; generation: string; status: string; source: string | null; updated_at: string | null; completeness: number; missing: string[] }[];
}
interface Report { fatal: string | null; rows: { line: number; label: string; errors: string[]; warnings: string[] }[] }
interface Change { id: number; slug: string | null; user: string | null; action: string; field: string | null; old: string | null; new: string | null; at: string }

const SAMPLE = `brand,model,generation,modification,years,fuel,hp,torque,transmission,drive,body,acc,cons,price
Volkswagen,Golf,Mk8,1.5 eTSI DSG-7,2020–2024,petrol,150,250,robot,FWD,hatch,8.5,6.4,21500
Toyota,Camry,XV70,2.5 АКП-8,2018–2021,petrol,181,221,auto,FWD,sedan,9.0,9.3,24000
Ford,Focus,Mk4,1.0 EcoBoost МКП-6,2018–2022,petrol,125,170,manual,FWD,hatch,10.0,32,13500
Mazda,3,BP,2.0 Skyactiv-G АКП-6,2019–2023,petrol,,213,auto,FWD,hatch,,7.1,`;

export default function Admin() {
  const { user, ready, toast } = useStore();
  const [q, setQ] = useState<Quality | null>(null);
  const [log, setLog] = useState<Change[]>([]);
  const [csv, setCsv] = useState(SAMPLE);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Quality>("/api/admin/quality").then(setQ).catch((e) => setError(e.message));
    api<Change[]>("/api/admin/changelog").then(setLog).catch(() => null);
  }, []);
  useEffect(() => { if (user && user.role !== "user") load(); }, [user, load]);

  if (!ready) return <p className="loading">Завантаження…</p>;
  if (!user || user.role === "user") {
    return <div className="empty"><b>Адмінпанель доступна редакторам і адміністраторам</b><span>Увійдіть під обліковим записом із правами редактора.</span><Link className="btn" href="/account">Увійти</Link></div>;
  }
  const validate = async () => setReport(await api<Report>("/api/admin/import/validate", { method: "POST", json: { csv } }));
  const apply = async () => {
    const r = await api<{ added: number }>("/api/admin/import/apply", { method: "POST", json: { csv } });
    toast(`Додано модифікацій: ${r.added}. Статус: не перевірено.`);
    setReport(null);
    load();
  };
  const okN = report?.rows.filter((r) => !r.errors.length).length ?? 0;

  return (
    <>
      <div className="page-head"><p className="eyebrow">Адміністративна панель</p><h1>Якість даних</h1>
        <p>Кожна модифікація має джерело, дату оновлення і статус перевірки. Імпортовані рядки потрапляють у каталог зі статусом «Не перевірено» й не перезаписують наявні значення.</p></div>
      {error && <p className="err">{error}</p>}
      {q && (
        <section className="stack">
          <div className="stats">
            <div className="stat"><span className="label">Модифікацій</span><span className="big-num">{q.total}</span></div>
            <div className="stat"><span className="label">Перевірено</span><span className="big-num">{q.counts.verified}</span></div>
            <div className="stat"><span className="label">Частково</span><span className="big-num">{q.counts.partial}</span></div>
            <div className="stat"><span className="label">Не перевірено</span><span className="big-num">{q.counts.unverified}</span></div>
          </div>
          <div className="tbl-wrap"><table>
            <thead><tr><th>Модифікація</th><th>Статус</th><th className="n">Заповненість</th><th>Джерело</th><th>Оновлено</th></tr></thead>
            <tbody>{q.items.map((c) => {
              const s = STATUS[c.status] ?? STATUS.unverified;
              const col = c.completeness < 60 ? "var(--bad)" : c.completeness < 90 ? "var(--warn)" : "var(--good)";
              return (
                <tr key={c.slug}>
                  <td><Link href={`/cars/${c.slug}`}>{c.name}</Link><div className="small muted">{c.generation}</div></td>
                  <td><span className={`pill ${s[1]}`}>{s[0]}</span></td>
                  <td className="n" style={{ minWidth: 140 }} title={c.missing.length ? `Бракує: ${c.missing.join(", ")}` : "Усі ключові поля заповнені"}>
                    <div className="row" style={{ gap: 8, justifyContent: "flex-end", flexWrap: "nowrap" }}><div className="bar" style={{ width: 70 }}><i style={{ width: `${c.completeness}%`, background: col }} /></div>{c.completeness} %</div>
                  </td>
                  <td className="small">{c.source}</td><td className="small num">{c.updated_at}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        </section>
      )}
      <section className="split" style={{ marginTop: 32 }}>
        <div className="panel stack">
          <h3>Імпорт із CSV</h3>
          <p className="small muted">Колонки: brand, model, generation, modification, years, fuel (petrol / diesel / hybrid / electric), hp, torque, transmission (auto / robot / cvt / manual), drive (FWD / RWD / AWD), body, acc, cons, price. Роздільник — кома або крапка з комою.</p>
          <div className="field"><label htmlFor="csvIn">Дані для імпорту</label><textarea id="csvIn" rows={8} spellCheck={false} value={csv} onChange={(e) => { setCsv(e.target.value); setReport(null); }} /></div>
          <div className="row"><button className="btn-primary" onClick={validate}>Перевірити імпорт</button><button disabled={!okN} onClick={apply}>Додати коректні рядки ({okN})</button></div>
        </div>
        <div className="stack" style={{ minWidth: 0 }}>
          {!report && <div className="empty"><b>Звіт про перевірку з’явиться тут</b><span>Натисніть «Перевірити імпорт». Приклад містить дублікат, помилку одиниць і рядок із пропусками.</span></div>}
          {report?.fatal && <div className="notice">{report.fatal}</div>}
          {report?.rows.map((r) => (
            <div className="panel panel-tight stack" style={{ gap: 6 }} key={r.line}>
              <div className="spread"><b>Рядок {r.line}: {r.label}</b>
                <span className={`pill ${r.errors.length ? "bad" : r.warnings.length ? "warn" : "good"}`}>{r.errors.length ? "Відхилено" : r.warnings.length ? "З пропусками" : "Коректно"}</span></div>
              {(r.errors.length > 0 || r.warnings.length > 0) && <ul className="reasons" style={{ margin: 0 }}>
                {r.errors.map((e) => <li className="minus" key={e}>{e}</li>)}{r.warnings.map((e) => <li className="note" key={e}>{e}</li>)}</ul>}
            </div>
          ))}
        </div>
      </section>
      <section className="stack" style={{ marginTop: 32 }}>
        <h3>Журнал змін</h3>
        {log.length ? (
          <div className="tbl-wrap"><table>
            <thead><tr><th>Час</th><th>Хто</th><th>Дія</th><th>Модифікація</th><th>Поле</th><th>Було → стало</th></tr></thead>
            <tbody>{log.map((c) => <tr key={c.id}><td className="small num">{c.at.slice(0, 16).replace("T", " ")}</td><td className="small">{c.user ?? "—"}</td><td>{c.action}</td><td className="small">{c.slug ?? "—"}</td><td className="small">{c.field ?? "—"}</td><td className="small">{c.old ?? "—"} → {c.new ?? "—"}</td></tr>)}</tbody>
          </table></div>
        ) : <p className="small muted">Змін ще не було.</p>}
      </section>
    </>
  );
}
