"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { nf } from "@/lib/format";
import { useStore } from "@/lib/store";

interface Review { id: number; author: string; rating: number; pros: string; cons: string; car_year: number | null; owned_years: number | null; mileage_km: number | null; created_at: string }
interface Summary { count: number; average: number | null; distribution: Record<string, number>; items: Review[] }
interface Mine extends Review { slug: string; status: "pending" | "published" | "rejected"; reject_reason: string | null }

const STATUS: Record<Mine["status"], [string, string]> = {
  pending: ["На перевірці", "warn"], published: ["Опубліковано", "good"], rejected: ["Відхилено", "bad"],
};
export const stars = (n: number) => "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n));

export function Reviews({ slug, years }: { slug: string; years: number[] }) {
  const { user, toast } = useStore();
  const [data, setData] = useState<Summary | null>(null);
  const [mine, setMine] = useState<Mine | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ rating: 0, pros: "", cons: "", car_year: "", owned_years: "", mileage_km: "" });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Summary>(`/api/cars/${slug}/reviews`).then(setData).catch(() => null);
    if (user) api<Mine[]>("/api/me/reviews").then((l) => {
      const m = l.find((r) => r.slug === slug) ?? null;
      setMine(m);
      if (m) setForm({ rating: m.rating, pros: m.pros, cons: m.cons, car_year: m.car_year ? String(m.car_year) : "",
        owned_years: m.owned_years != null ? String(m.owned_years) : "", mileage_km: m.mileage_km != null ? String(m.mileage_km) : "" });
    }).catch(() => null);
  }, [slug, user]);
  useEffect(load, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.rating) return setError("Поставте оцінку від 1 до 5.");
    try {
      await api(`/api/cars/${slug}/reviews/mine`, { method: "PUT", json: {
        rating: form.rating, pros: form.pros, cons: form.cons,
        car_year: form.car_year ? Number(form.car_year) : null,
        owned_years: form.owned_years ? Number(form.owned_years.replace(",", ".")) : null,
        mileage_km: form.mileage_km ? Number(form.mileage_km) : null,
      } });
      toast("Дякуємо! Відгук з’явиться після перевірки модератором");
      setOpen(false);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <section className="stack">
      <div className="spread">
        <h3>Відгуки власників</h3>
        {data && data.count > 0 && <span><b className="stars" aria-label={`Середня оцінка ${data.average} з 5`}>{stars(data.average!)}</b> <b>{nf(data.average, 1)}</b> <span className="muted small">· відгуків: {data.count}</span></span>}
      </div>
      {data && data.count > 0 && (
        <div className="dist" aria-label="Розподіл оцінок">
          {[5, 4, 3, 2, 1].map((k) => (
            <div key={k} className="dist-row"><span className="small">{k} ★</span>
              <div className="bar"><i style={{ width: `${(data.distribution[String(k)] / data.count) * 100}%`, background: "var(--needle)" }} /></div>
              <span className="small muted num">{data.distribution[String(k)]}</span></div>
          ))}
        </div>
      )}
      {data && data.count === 0 && <p className="muted">Відгуків ще немає. Якщо ви володієте цією модифікацією, розкажіть про неї першим.</p>}
      {data?.items.map((r) => (
        <article key={r.id} className="panel panel-tight stack" style={{ gap: 6 }}>
          <div className="spread"><span><b className="stars">{stars(r.rating)}</b> <b>{r.author}</b></span>
            <span className="small muted">{[r.car_year && `авто ${r.car_year} р.`, r.owned_years != null && `володіє ${nf(r.owned_years, r.owned_years % 1 ? 1 : 0)} р.`, r.mileage_km != null && `пробіг ${nf(r.mileage_km)} км`].filter(Boolean).join(" · ")}</span></div>
          {r.pros && <p><span className="pill good">Плюси</span> {r.pros}</p>}
          {r.cons && <p><span className="pill bad">Мінуси</span> {r.cons}</p>}
        </article>
      ))}

      {!user ? (
        <p className="small"><Link href="/account">Увійдіть</Link>, щоб залишити відгук про свій автомобіль.</p>
      ) : (
        <>
          {mine && !open && (
            <div className="row"><span className={`pill ${STATUS[mine.status][1]}`}>Ваш відгук: {STATUS[mine.status][0]}</span>
              {mine.status === "rejected" && mine.reject_reason && <span className="small">Причина: {mine.reject_reason}</span>}
              <button className="btn-sm" onClick={() => setOpen(true)}>Редагувати</button></div>
          )}
          {!mine && !open && <button className="btn-primary" style={{ justifySelf: "start" }} onClick={() => setOpen(true)}>Залишити відгук</button>}
          {open && (
            <form className="panel stack" onSubmit={submit}>
              <div className="field"><span className="label" id="rv-rating-l">Загальна оцінка</span>
                <div className="row" role="radiogroup" aria-labelledby="rv-rating-l">
                  {[1, 2, 3, 4, 5].map((k) => (
                    <button key={k} type="button" role="radio" aria-checked={form.rating === k} className={`star-btn${form.rating >= k ? " on" : ""}`}
                      aria-label={`${k} з 5`} onClick={() => setForm({ ...form, rating: k })}>★</button>
                  ))}
                </div></div>
              <div className="field"><label htmlFor="rv-pros">Плюси</label><textarea id="rv-pros" rows={3} maxLength={2000} value={form.pros} onChange={(e) => setForm({ ...form, pros: e.target.value })} style={{ fontFamily: "var(--f-body)", fontSize: 14 }} /></div>
              <div className="field"><label htmlFor="rv-cons">Мінуси</label><textarea id="rv-cons" rows={3} maxLength={2000} value={form.cons} onChange={(e) => setForm({ ...form, cons: e.target.value })} style={{ fontFamily: "var(--f-body)", fontSize: 14 }} /></div>
              <div className="fields">
                <div className="field"><label htmlFor="rv-year">Рік вашого авто</label><select id="rv-year" value={form.car_year} onChange={(e) => setForm({ ...form, car_year: e.target.value })}><option value="">Не вказано</option>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select></div>
                <div className="field"><label htmlFor="rv-own">Років володіння</label><input id="rv-own" inputMode="decimal" value={form.owned_years} onChange={(e) => setForm({ ...form, owned_years: e.target.value })} /></div>
                <div className="field"><label htmlFor="rv-km">Пробіг зараз, км</label><input id="rv-km" type="number" min={0} value={form.mileage_km} onChange={(e) => setForm({ ...form, mileage_km: e.target.value })} /></div>
              </div>
              <p className="small muted">Відгук публікується після перевірки модератором. Показуємо лише ваше ім’я, без пошти.</p>
              {error && <p className="err">{error}</p>}
              <div className="row"><button className="btn-primary" type="submit">{mine ? "Зберегти й надіслати на перевірку" : "Надіслати відгук"}</button><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Скасувати</button></div>
            </form>
          )}
        </>
      )}
    </section>
  );
}
