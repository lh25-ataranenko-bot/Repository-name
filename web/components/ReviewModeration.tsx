"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { stars } from "./Reviews";

interface Pending { id: number; slug: string; car: string; email: string; author: string; rating: number; pros: string; cons: string; created_at: string }

/** Editors publish or reject owners' reviews; a rejection reason is shown to the author. */
export function ReviewModeration() {
  const { toast } = useStore();
  const [items, setItems] = useState<Pending[] | null>(null);
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const load = useCallback(() => { api<Pending[]>("/api/admin/reviews?status=pending").then(setItems).catch(() => setItems([])); }, []);
  useEffect(load, [load]);

  const decide = async (r: Pending, status: "published" | "rejected") => {
    try {
      await api(`/api/admin/reviews/${r.id}`, { method: "PATCH", json: { status, reason: reasons[r.id] ?? null } });
      toast(status === "published" ? "Відгук опубліковано" : "Відгук відхилено");
      load();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <section className="stack" style={{ marginTop: 32 }}>
      <h3>Відгуки на перевірці{items && items.length > 0 ? ` (${items.length})` : ""}</h3>
      {items && items.length === 0 && <p className="small muted">Нових відгуків немає.</p>}
      {items?.map((r) => (
        <article key={r.id} className="panel panel-tight stack" style={{ gap: 6 }}>
          <div className="spread"><span><b className="stars">{stars(r.rating)}</b> <Link href={`/cars/${r.slug}`}>{r.car}</Link></span><span className="small muted">{r.author} · {r.email} · {r.created_at.slice(0, 10)}</span></div>
          {r.pros && <p><span className="pill good">Плюси</span> {r.pros}</p>}
          {r.cons && <p><span className="pill bad">Мінуси</span> {r.cons}</p>}
          <div className="row">
            <button className="btn-primary btn-sm" onClick={() => decide(r, "published")}>Опублікувати</button>
            <input aria-label="Причина відхилення" placeholder="Причина відхилення (її побачить автор)" style={{ maxWidth: 360 }}
              value={reasons[r.id] ?? ""} onChange={(e) => setReasons({ ...reasons, [r.id]: e.target.value })} />
            <button className="btn-sm" disabled={!reasons[r.id]?.trim()} onClick={() => decide(r, "rejected")}>Відхилити</button>
          </div>
        </article>
      ))}
    </section>
  );
}
