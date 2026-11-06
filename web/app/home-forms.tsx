"use client";

import { BudgetField } from "@/components/BudgetField";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ModelYearFields, type ModelYear } from "@/components/ModelYearFields";
import { BODY, FUEL, PRESETS, usd } from "@/lib/format";

interface Parsed { filters: Record<string, string | number>; preset: string | null; tags: string[] }

export function SmartSearch() {
  const router = useRouter();
  const [q, setQ] = useState("кросовер до 25 тис $ з автоматом для сім'ї");
  const [p, setP] = useState<Parsed | null>(null);
  useEffect(() => {
    const t = setTimeout(() => api<Parsed>("/api/search/parse", { method: "POST", json: { q } }).then(setP).catch(() => setP(null)), 250);
    return () => clearTimeout(t);
  }, [q]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await api<Parsed>("/api/search/parse", { method: "POST", json: { q } });
    const params = new URLSearchParams(Object.entries(r.filters).map(([k, v]) => [k, String(v)]));
    params.set("preset", r.preset ?? "balanced");
    if (r.tags.length) params.set("tags", r.tags.join("|"));
    router.push(`/rating?${params}`);
  };
  return (
    <form className="smart" onSubmit={submit}>
      <label htmlFor="smartQ">Опишіть, яке авто шукаєте</label>
      <div className="smart-row">
        <input id="smartQ" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" maxLength={500} />
        <button className="btn-primary" type="submit">Підібрати</button>
      </div>
      <div className="chips">
        {p?.tags.length ? <><span className="label">Розпізнано:</span>{p.tags.map((t) => <span className="chip on" key={t}>{t}</span>)}</>
          : <span className="small muted">Поки нічого не розпізнано</span>}
      </div>
      <p className="small muted">Пошук розпізнає бюджет, паливо, КПП, привід, кузов і призначення авто. Приклади: «дизель до 20000$ повний привід», «економне авто для міста до 16 тис». Маєте складніше запитання? <a href="/assistant">Запитайте AI-помічника</a>.</p>
    </form>
  );
}

export function QuickPick() {
  const router = useRouter();
  const [budget, setBudget] = useState(25000);
  const [body, setBody] = useState("any");
  const [fuel, setFuel] = useState("any");
  const [trans, setTrans] = useState("any");
  const [preset, setPreset] = useState("family");
  const [my, setMy] = useState<ModelYear>({ brand: "", model: "", year: "" });
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    const p = new URLSearchParams({ max_price: String(budget), trans });
    if (body !== "any") p.set("body", body);
    if (fuel !== "any") p.set("fuel", fuel);
    Object.entries(my).forEach(([k, v]) => v && p.set(k, v));
    api<{ count: number }>(`/api/cars?${p}`).then((r) => setCount(r.count)).catch(() => setCount(null));
  }, [budget, body, fuel, trans, my]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = new URLSearchParams({ max_price: String(budget), body, fuel, trans, preset });
    Object.entries(my).forEach(([k, v]) => v && p.set(k, v));
    router.push(`/rating?${p}`);
  };
  return (
    <form className="quick" onSubmit={submit}>
      <div className="spread"><h3>Швидкий підбір</h3></div>
      <BudgetField id="qBudget" label="Бюджет" value={budget} onChange={setBudget} />
      <div className="fields">
        <ModelYearFields idPrefix="q" value={my} onChange={setMy} />
        <div className="field"><label htmlFor="qBody">Кузов</label><select id="qBody" value={body} onChange={(e) => setBody(e.target.value)}><option value="any">Будь-який</option>{Object.entries(BODY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="field"><label htmlFor="qFuel">Паливо</label><select id="qFuel" value={fuel} onChange={(e) => setFuel(e.target.value)}><option value="any">Будь-яке</option>{Object.entries(FUEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="field"><label htmlFor="qTrans">Коробка</label><select id="qTrans" value={trans} onChange={(e) => setTrans(e.target.value)}><option value="any">Будь-яка</option><option value="automatic">Автоматична</option><option value="manual">Механіка</option></select></div>
        <div className="field"><label htmlFor="qPurpose">Призначення</label><select id="qPurpose" value={preset} onChange={(e) => setPreset(e.target.value)}>{Object.entries(PRESETS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      </div>
      <p className="small muted">{count == null ? " " : count ? `Підходить модифікацій: ${count}` : "Жодна модифікація не проходить ці умови. Збільште бюджет або послабте фільтри."}</p>
      <button className="btn-primary" type="submit">Показати рейтинг варіантів</button>
    </form>
  );
}
