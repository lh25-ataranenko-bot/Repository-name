"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { nf } from "@/lib/format";

interface Stats { days: number; top: { slug: string; views: number }[]; per_day: { day: string; views: number }[] }

/** Anonymous page views for editors: which modifications people look at. */
export function PopularStats() {
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => { api<Stats>("/api/admin/popular?days=30").then(setS).catch(() => null); }, []);
  if (!s) return null;
  const max = Math.max(1, ...s.top.map((t) => t.views));
  const total = s.per_day.reduce((a, d) => a + d.views, 0);
  return (
    <section className="stack" style={{ marginTop: 32 }}>
      <h3>Перегляди за 30 днів</h3>
      <p className="small muted">Усього переглядів сторінок авто: {nf(total)}. Рахуємо лише кількість, без даних про відвідувачів.</p>
      {s.top.length === 0 ? <p className="small muted">Переглядів ще немає.</p> : (
        <div className="tbl-wrap"><table>
          <thead><tr><th>Модифікація</th><th style={{ minWidth: 160 }} /><th className="n">Перегляди</th></tr></thead>
          <tbody>{s.top.map((t) => (
            <tr key={t.slug}><td><Link href={`/cars/${t.slug}`}>{t.slug}</Link></td>
              <td><div className="bar"><i style={{ width: `${(t.views / max) * 100}%` }} /></div></td><td className="n">{nf(t.views)}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </section>
  );
}
