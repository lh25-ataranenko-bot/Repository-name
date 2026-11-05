"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PopularStats } from "@/components/PopularStats";
import { ReviewModeration } from "@/components/ReviewModeration";
import { ACTION, STATUS, logValue } from "@/lib/format";
import { useStore } from "@/lib/store";

interface Quality {
  total: number;
  counts: Record<string, number>;
  items: { slug: string; name: string; generation: string; status: string; source: string | null; updated_at: string | null; completeness: number; missing: string[] }[];
}
interface Report { fatal: string | null; rows: { line: number; label: string; errors: string[]; warnings: string[] }[] }
interface AdminUser { id: number; email: string; name: string; role: string; verified: boolean; created_at: string }
interface Change { id: number; slug: string | null; user: string | null; action: string; field: string | null; old: string | null; new: string | null; at: string }

const ROLE: Record<string, string> = { user: "Користувач", editor: "Редактор", admin: "Адміністратор" };

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
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [find, setFind] = useState("");
  const [statusF, setStatusF] = useState("all");

  const load = useCallback(() => {
    api<Quality>("/api/admin/quality").then(setQ).catch((e) => setError(e.message));
    api<Change[]>("/api/admin/changelog").then(setLog).catch(() => null);
    api<AdminUser[]>("/api/admin/users").then(setUsers).catch(() => setUsers([]));
  }, []);
  useEffect(() => { if (user && user.role !== "user") load(); }, [user, load]);

  if (!ready) return <p className="loading">Завантаження…</p>;
  if (!user || user.role === "user") {
    return <div className="empty"><b>Адмінпанель доступна редакторам і адміністраторам</b><span>Увійдіть під обліковим записом із правами редактора.</span><Link className="btn" href="/account">Увійти</Link></div>;
  }
  // With a file chosen, both steps send the .xlsx; otherwise the CSV text.
  const body = () => {
    if (!file) return { json: { csv } };
    const fd = new FormData();
    fd.append("file", file);
    return { body: fd };
  };
  const validate = async () => {
    try {
      setReport(await api<Report>(file ? "/api/admin/import/xlsx/validate" : "/api/admin/import/validate", { method: "POST", ...body() }));
    } catch (e) {
      setReport({ fatal: (e as Error).message, rows: [] });
    }
  };
  const apply = async () => {
    const r = await api<{ added: number }>(file ? "/api/admin/import/xlsx/apply" : "/api/admin/import/apply", { method: "POST", ...body() });
    toast(`Додано модифікацій: ${r.added}. Статус: не перевірено.`);
    setReport(null);
    load();
  };
  const setRole = async (u: AdminUser, role: string) => {
    try {
      await api(`/api/admin/users/${u.id}`, { method: "PATCH", json: { role } });
      toast(`Роль ${u.email}: ${ROLE[role]}`);
      load();
    } catch (e) {
      toast((e as Error).message);
      load();
    }
  };
  const rows = (q?.items ?? []).filter((c) => (statusF === "all" || c.status === statusF) && c.name.toLowerCase().includes(find.toLowerCase()));
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
          <div className="spread">
            <div className="row">
              <input aria-label="Пошук модифікації" placeholder="Пошук: марка, модель, двигун" value={find} onChange={(e) => setFind(e.target.value)} style={{ width: 260 }} />
              <select aria-label="Статус" value={statusF} onChange={(e) => setStatusF(e.target.value)} style={{ width: "auto" }}>
                <option value="all">Усі статуси</option>{Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <span className="small muted">Показано: {rows.length}</span>
            </div>
            <Link className="btn btn-primary" href="/admin/cars/new">+ Додати модифікацію</Link>
          </div>
          <div className="tbl-wrap"><table>
            <thead><tr><th>Модифікація</th><th>Статус</th><th className="n">Заповненість</th><th>Джерело</th><th>Оновлено</th><th /></tr></thead>
            <tbody>{rows.map((c) => {
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
                  <td><Link className="btn btn-sm" href={`/admin/cars/${c.slug}`}>Редагувати</Link></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        </section>
      )}
      <section className="split" style={{ marginTop: 32 }}>
        <div className="panel stack">
          <h3>Імпорт із CSV або Excel</h3>
          <p className="small muted">Колонки: brand, model, generation, modification, years, fuel (petrol / diesel / hybrid / electric), hp, torque, transmission (auto / robot / cvt / manual), drive (FWD / RWD / AWD), body, acc, cons, price. Роздільник — кома або крапка з комою.</p>
          <div className="field"><label htmlFor="xlsxIn">Файл Excel (.xlsx), перший аркуш, перший рядок — заголовки</label>
            <input id="xlsxIn" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setReport(null); }} /></div>
          {file ? (
            <div className="row"><span className="small">Обрано файл: <b>{file.name}</b></span><button className="btn-ghost btn-sm" onClick={() => { setFile(null); setReport(null); (document.getElementById("xlsxIn") as HTMLInputElement).value = ""; }}>Використати текст CSV</button></div>
          ) : (
            <div className="field"><label htmlFor="csvIn">Або вставте CSV</label><textarea id="csvIn" rows={8} spellCheck={false} value={csv} onChange={(e) => { setCsv(e.target.value); setReport(null); }} /></div>
          )}
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
      <ReviewModeration />
      <PopularStats />
      {user.role === "admin" && users.length > 0 && (
        <section className="stack" style={{ marginTop: 32 }}>
          <h3>Користувачі й ролі</h3>
          <p className="small muted">Редактор може змінювати й перевіряти дані каталогу. Адміністратор також видаляє модифікації й керує ролями.</p>
          <div className="tbl-wrap"><table>
            <thead><tr><th>Пошта</th><th>Ім’я</th><th>Пошту підтверджено</th><th>Зареєстровано</th><th>Роль</th></tr></thead>
            <tbody>{users.map((u) => (
              <tr key={u.id}><td>{u.email}</td><td className="small">{u.name || "—"}</td>
                <td>{u.verified ? <span className="pill good">Так</span> : <span className="pill plain">Ні</span>}</td>
                <td className="small num">{u.created_at.slice(0, 10)}</td>
                <td><select aria-label={`Роль ${u.email}`} value={u.role} onChange={(e) => setRole(u, e.target.value)} style={{ width: "auto" }}>
                  {Object.entries(ROLE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td></tr>
            ))}</tbody>
          </table></div>
        </section>
      )}
      <section className="stack" style={{ marginTop: 32 }}>
        <h3>Журнал змін</h3>
        {log.length ? (
          <div className="tbl-wrap"><table>
            <thead><tr><th>Час</th><th>Хто</th><th>Дія</th><th>Модифікація</th><th>Поле</th><th>Було → стало</th></tr></thead>
            <tbody>{log.map((c) => <tr key={c.id}><td className="small num">{c.at.slice(0, 16).replace("T", " ")}</td><td className="small">{c.user ?? "—"}</td><td>{ACTION[c.action] ?? c.action}</td><td className="small">{c.slug ?? "—"}</td><td className="small">{c.field ?? "—"}</td><td className="small">{logValue(c.field, c.old)} → {logValue(c.field, c.new)}</td></tr>)}</tbody>
          </table></div>
        ) : <p className="small muted">Змін ще не було.</p>}
      </section>
    </>
  );
}
