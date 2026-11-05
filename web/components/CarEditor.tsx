"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ACTION, ASSIST, BODY, DRIVE, FUEL, STATUS, logValue } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Car, Issue } from "@/lib/types";
import { PhotoManager } from "./PhotoManager";

type Kind = "text" | "int" | "float" | "pct" | "select";
type Def = [key: string, label: string, kind: Kind, options?: Record<string, string>];

const TRANS_TYPE = { auto: "Автомат (АКП)", robot: "Робот (DSG/DCT)", cvt: "Варіатор", manual: "Механіка", reducer: "Редуктор (електро)" };
const LEVEL = { "висока": "Висока", "середня": "Середня", "низька": "Низька" };

const GROUPS: [string, Def[]][] = [
  ["Ідентифікація", [["name", "Назва модифікації", "text"], ["year_from", "Рік початку", "int"], ["year_to", "Рік завершення", "int"],
    ["body", "Кузов", "select", BODY], ["source", "Джерело даних", "text"]]],
  ["Двигун і трансмісія", [["fuel", "Паливо", "select", FUEL], ["engine_code", "Код двигуна", "text"], ["displacement", "Об’єм, см³", "int"],
    ["hp", "Потужність, к.с.", "int"], ["torque", "Момент, Н·м", "int"], ["transmission", "КПП (назва)", "text"],
    ["trans_type", "Тип КПП", "select", TRANS_TYPE], ["drive", "Привід", "select", DRIVE]]],
  ["Динаміка й витрата", [["acc", "0–100 км/год, с", "float"], ["vmax", "Макс. швидкість, км/год", "int"],
    ["cons_pass", "Витрата паспортна, л або кВт·год/100 км", "float"], ["cons_real", "Витрата реальна", "float"],
    ["tank", "Бак, л", "float"], ["battery", "Батарея (корисна), кВт·год", "float"]]],
  ["Габарити", [["length", "Довжина, мм", "int"], ["width", "Ширина, мм", "int"], ["height", "Висота, мм", "int"],
    ["wheelbase", "Колісна база, мм", "int"], ["clearance", "Кліренс, мм", "int"], ["trunk", "Багажник, л", "int"]]],
  ["Безпека і комфорт", [["ncap", "Euro NCAP, зірок", "int"], ["ncap_year", "Рік тесту NCAP", "int"], ["airbags", "Подушки безпеки", "int"],
    ["comfort", "Індекс комфорту (0–10)", "float"]]],
  ["Експлуатація і ринок", [["reliability", "Надійність (0–100)", "int"], ["reliability_confidence", "Упевненість оцінки", "select", LEVEL],
    ["maint_per_year", "ТО на рік, $", "float"], ["repair_per_year", "Ремонти на рік, $", "float"],
    ["depreciation", "Знецінення на рік, %", "pct"], ["price", "Ринкова ціна, $", "float"], ["year_ref", "Рік, до якого належить ціна", "int"],
    ["liquidity", "Ліквідність", "select", LEVEL]]],
];
const ALL_DEFS = GROUPS.flatMap(([, d]) => d);

type Form = Record<string, string>;
const toForm = (c: Partial<Car>): Form =>
  Object.fromEntries(ALL_DEFS.map(([k, , kind]) => {
    const v = (c as Record<string, unknown>)[k];
    if (v == null) return [k, ""];
    return [k, kind === "pct" ? String(Math.round((v as number) * 1000) / 10) : String(v)];
  }));
const parse = (kind: Kind, v: string): unknown => {
  if (v.trim() === "") return null;
  if (kind === "int") return parseInt(v, 10);
  if (kind === "float") return parseFloat(v.replace(",", "."));
  if (kind === "pct") return parseFloat(v.replace(",", ".")) / 100;
  return v.trim();
};

interface Change { id: number; user: string | null; action: string; field: string | null; old: string | null; new: string | null; at: string }

export function CarEditor({ slug }: { slug?: string }) {
  const router = useRouter();
  const { user, toast } = useStore();
  const [car, setCar] = useState<Car | null>(null);
  const [form, setForm] = useState<Form>(toForm({ body: "sedan", fuel: "petrol", trans_type: "auto", drive: "FWD" } as Partial<Car>));
  const [assists, setAssists] = useState<string[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [names, setNames] = useState({ brand: "", model: "", generation: "" });
  const [log, setLog] = useState<Change[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!slug) return;
    api<Car>(`/api/cars/${slug}`).then((c) => { setCar(c); setForm(toForm(c)); setAssists(c.assists); setIssues(c.issues); }).catch((e) => setError(e.message));
    api<Change[]>(`/api/admin/changelog?slug=${slug}`).then(setLog).catch(() => null);
  };
  useEffect(load, [slug]);

  const diff = () => {
    const out: Record<string, unknown> = {};
    for (const [k, , kind] of ALL_DEFS) {
      const v = parse(kind, form[k]);
      const old = car ? (car as unknown as Record<string, unknown>)[k] ?? null : null;
      const same = typeof v === "number" && typeof old === "number" ? Math.abs(v - old) < 1e-9 : v === old;
      if (!car ? v !== null : !same) out[k] = v;
    }
    if (!car || [...assists].sort().join() !== [...car.assists].sort().join()) out.assists = assists;
    return out;
  };
  const issuesChanged = () => !car || JSON.stringify(issues) !== JSON.stringify(car.issues);

  const save = async (review = false) => {
    setError(null);
    for (const [k, label, kind] of ALL_DEFS) {
      if ((kind === "int" || kind === "float" || kind === "pct") && form[k].trim() !== "" && !Number.isFinite(parse(kind, form[k]) as number)) {
        return setError(`Поле «${label}» має бути числом.`);
      }
    }
    if (issues.some((i) => !i.part.trim())) return setError("У кожної несправності має бути назва вузла.");
    setBusy(true);
    try {
      let target = slug;
      if (!slug) {
        const r = await api<{ slug: string }>("/api/admin/cars", { method: "POST", json: { ...names, ...diff() } });
        target = r.slug;
      } else {
        const changes = diff();
        if (review) changes.status = "verified";
        if (Object.keys(changes).length) await api(`/api/admin/cars/${slug}`, { method: "PATCH", json: changes });
      }
      if (issuesChanged()) await api(`/api/admin/cars/${target}/issues`, { method: "PUT", json: issues });
      toast(slug ? (review ? "Збережено й позначено перевіреним" : "Зміни збережено") : "Модифікацію створено зі статусом «Не перевірено»");
      if (!slug) router.push(`/admin/cars/${target}`);
      else load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!slug || !window.confirm("Видалити модифікацію назавжди? Її приберуть з обраного й порівнянь усіх користувачів.")) return;
    await api(`/api/admin/cars/${slug}`, { method: "DELETE" });
    toast("Модифікацію видалено");
    router.push("/admin");
  };

  if (slug && !car) return error ? <p className="err">{error}</p> : <p className="loading">Завантаження…</p>;
  const st = car ? STATUS[car.status] ?? STATUS.unverified : null;
  const pending = car ? Object.keys(diff()).length + (issuesChanged() ? 1 : 0) : 0;

  return (
    <div className="stack-lg">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <p className="eyebrow"><Link href="/admin">Адмінпанель</Link> · {car ? "Редагування" : "Нова модифікація"}</p>
        <h1>{car ? `${car.brand} ${car.model} ${car.name}` : "Нова модифікація"}</h1>
        {car && st && <div className="row"><span className={`pill ${st[1]}`}>{st[0]}</span><span className="small muted">{car.generation} · оновлено {car.updated_at ?? "—"} · <Link href={`/cars/${car.slug}`}>Відкрити на сайті</Link></span></div>}
        <p className="small">Зміна ключових значень (потужність, витрата, ціна, надійність, витрати на обслуговування) повертає статус «Частково перевірено», доки редактор не підтвердить їх за джерелом.</p>
      </div>

      {!car && (
        <section className="panel stack"><h3>Місце в каталозі</h3>
          <div className="fields">
            {(["brand", "model", "generation"] as const).map((k) => (
              <div className="field" key={k}><label htmlFor={`n-${k}`}>{{ brand: "Марка", model: "Модель", generation: "Покоління" }[k]}</label>
                <input id={`n-${k}`} required value={names[k]} onChange={(e) => setNames({ ...names, [k]: e.target.value })} /></div>
            ))}
          </div>
          <p className="small muted">Якщо такої марки, моделі чи покоління ще немає, їх буде створено.</p>
        </section>
      )}

      {GROUPS.map(([title, defs]) => (
        <section className="panel stack" key={title}>
          <h3>{title}</h3>
          <div className="fields">
            {defs.map(([k, label, kind, options]) => (
              <div className="field" key={k}>
                <label htmlFor={`f-${k}`}>{label}</label>
                {kind === "select" ? (
                  <select id={`f-${k}`} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })}>
                    {!["body", "fuel", "trans_type", "drive"].includes(k) && <option value="">Немає даних</option>}
                    {Object.entries(options!).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                ) : (
                  <input id={`f-${k}`} inputMode={kind === "text" ? undefined : "decimal"} value={form[k]} placeholder="Немає даних"
                    onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                )}
              </div>
            ))}
          </div>
          {title === "Безпека і комфорт" && (
            <div className="stack" style={{ gap: 6 }}>
              <span className="label">Асистенти водія</span>
              <div className="row">{Object.entries(ASSIST).map(([k, l]) => (
                <label className="check" key={k}><input type="checkbox" checked={assists.includes(k)}
                  onChange={(e) => setAssists(e.target.checked ? [...assists, k] : assists.filter((a) => a !== k))} /> {l}</label>
              ))}</div>
            </div>
          )}
        </section>
      ))}

      {car && <PhotoManager slug={car.slug} />}
      <section className="panel stack">
        <div className="spread"><h3>Типові несправності</h3><button className="btn-sm" onClick={() => setIssues([...issues, { part: "", frequency: "іноді", cost: 0 }])}>+ Додати несправність</button></div>
        {issues.length === 0 && <p className="small muted">Несправностей не додано. На сайті буде показано «Немає даних».</p>}
        {issues.map((i, n) => (
          <div className="fields" key={n} style={{ alignItems: "end" }}>
            <div className="field" style={{ gridColumn: "span 2" }}><label htmlFor={`i-p-${n}`}>Вузол</label>
              <input id={`i-p-${n}`} value={i.part} onChange={(e) => setIssues(issues.map((x, j) => (j === n ? { ...x, part: e.target.value } : x)))} /></div>
            <div className="field"><label htmlFor={`i-f-${n}`}>Частота</label>
              <select id={`i-f-${n}`} value={i.frequency} onChange={(e) => setIssues(issues.map((x, j) => (j === n ? { ...x, frequency: e.target.value as Issue["frequency"] } : x)))}>
                <option value="часто">часто</option><option value="іноді">іноді</option><option value="рідко">рідко</option></select></div>
            <div className="field"><label htmlFor={`i-c-${n}`}>Ремонт, $</label>
              <input id={`i-c-${n}`} inputMode="decimal" value={i.cost} onChange={(e) => setIssues(issues.map((x, j) => (j === n ? { ...x, cost: Number(e.target.value) || 0 } : x)))} /></div>
            <button className="btn-ghost btn-sm" onClick={() => setIssues(issues.filter((_, j) => j !== n))}>Прибрати</button>
          </div>
        ))}
      </section>

      {error && <div className="notice">{error}</div>}
      <div className="row" style={{ position: "sticky", bottom: 0, background: "var(--bg)", paddingBlock: 12, borderTop: "1px solid var(--line)" }}>
        <button className="btn-primary" disabled={busy || (!!car && !pending) || (!car && (!names.brand || !names.model || !names.generation || !form.name))} onClick={() => save(false)}>
          {car ? (pending ? `Зберегти зміни (${pending})` : "Змін немає") : "Створити модифікацію"}
        </button>
        {car && <button disabled={busy} onClick={() => save(true)}>{pending ? "Зберегти й позначити перевіреним" : car.status === "verified" ? "Уже перевірено" : "Позначити перевіреним"}</button>}
        {car && user?.role === "admin" && <button className="btn-ghost" style={{ marginLeft: "auto", color: "var(--bad)" }} onClick={remove}>Видалити</button>}
      </div>

      {car && (
        <section className="stack"><h3>Історія змін</h3>
          {log.length ? (
            <div className="tbl-wrap"><table>
              <thead><tr><th>Час</th><th>Хто</th><th>Дія</th><th>Поле</th><th>Було → стало</th></tr></thead>
              <tbody>{log.map((c) => <tr key={c.id}><td className="small num">{c.at.slice(0, 16).replace("T", " ")}</td><td className="small">{c.user ?? "—"}</td><td>{ACTION[c.action] ?? c.action}</td><td className="small">{c.field ?? "—"}</td><td className="small" style={{ overflowWrap: "anywhere" }}>{logValue(c.field, c.old)} → {logValue(c.field, c.new)}</td></tr>)}</tbody>
            </table></div>
          ) : <p className="small muted">Змін ще не було.</p>}
        </section>
      )}
    </div>
  );
}
