"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { nf } from "@/lib/format";
import type { GarageCar } from "@/lib/types";

const TONE = { ok: ["good", "ТО за планом"], soon: ["warn", "Скоро ТО"], overdue: ["bad", "ТО прострочено"] } as const;

/** Next service by mileage or date, whichever comes first; the intervals are editable. */
export function ServiceDue({ g, onSaved }: { g: GarageCar; onSaved: () => void }) {
  const s = g.service;
  const [edit, setEdit] = useState(false);
  const [km, setKm] = useState(String(s.interval_km));
  const [months, setMonths] = useState(String(s.interval_months));
  const [error, setError] = useState<string | null>(null);
  const due = new Date(s.due_date).toLocaleDateString("uk-UA");
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api(`/api/me/garage/${g.id}`, { method: "PATCH", json: { service_interval_km: Number(km), service_interval_months: Number(months) } });
      setEdit(false);
      setError(null);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <div className={`verdict ${TONE[s.status][0]}`} style={{ padding: "10px 14px" }}>
      <div className="spread">
        <span><span className={`pill ${TONE[s.status][0]}`}>{TONE[s.status][1]}</span>{" "}
          {s.status === "overdue"
            ? <>наступне ТО мало бути на {nf(s.due_km)} км або до {due}</>
            : <>через <b>{nf(s.km_left)} км</b> або до <b>{due}</b> ({s.days_left} дн.)</>}</span>
        <button className="btn-sm btn-ghost" onClick={() => setEdit(!edit)}>Інтервал: {nf(s.interval_km)} км / {s.interval_months} міс.</button>
      </div>
      <span className="small muted">{s.last_km != null ? `Останнє ТО: ${nf(s.last_km)} км, ${new Date(s.last_date!).toLocaleDateString("uk-UA")}` : "ТО ще не записано: рахуємо від пробігу, з яким авто додано в гараж"}</span>
      {edit && (
        <form className="row" onSubmit={save} style={{ marginTop: 6 }}>
          <label htmlFor={`si-km-${g.id}`}>Кожні</label><input id={`si-km-${g.id}`} type="number" min={1000} max={100000} step={500} value={km} onChange={(e) => setKm(e.target.value)} style={{ width: 110 }} /><span className="small">км або</span>
          <input aria-label="Місяців між ТО" type="number" min={1} max={60} value={months} onChange={(e) => setMonths(e.target.value)} style={{ width: 70 }} /><span className="small">міс.</span>
          <button className="btn-sm btn-primary" type="submit">Зберегти</button>
          {error && <span className="err">{error}</span>}
        </form>
      )}
    </div>
  );
}
