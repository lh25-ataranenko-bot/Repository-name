"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

interface Item { id: number; kind: "price" | "review"; text: string; slug: string | null; created_at: string; read: boolean }

export function Notifications() {
  const { user, updateUser, toast } = useStore();
  const [data, setData] = useState<{ unread: number; items: Item[] } | null>(null);
  const load = useCallback(() => { api<{ unread: number; items: Item[] }>("/api/me/notifications").then(setData).catch(() => null); }, []);
  useEffect(load, [load]);
  if (!user || !data) return null;
  const readAll = async () => { await api("/api/me/notifications/read", { method: "POST" }); load(); };
  const toggleEmail = async () => {
    const u = await api<typeof user>("/api/me", { method: "PATCH", json: { email_notifications: !user.email_notifications } });
    updateUser(u);
    toast(u.email_notifications ? "Листи про обране увімкнено" : "Листи про обране вимкнено");
  };
  return (
    <section className="stack" id="notifications" style={{ scrollMarginTop: 80 }}>
      <div className="spread"><h2>Сповіщення{data.unread ? ` (${data.unread} нових)` : ""}</h2>
        {data.unread > 0 && <button className="btn-sm" onClick={readAll}>Позначити прочитаними</button>}</div>
      <label className="check"><input type="checkbox" checked={user.email_notifications} onChange={toggleEmail} /> Надсилати листи, коли в обраних авто змінюється ціна або з’являється відгук</label>
      {!data.items.length ? <p className="small muted">Тут з’являться зміни цін і нові відгуки про авто з вашого обраного.</p> : (
        <ul className="checklist">{data.items.map((n) => (
          <li key={n.id} style={{ padding: "6px 4px", display: "flex", gap: 10, alignItems: "baseline" }}>
            <span className={`pill ${n.kind === "price" ? "info" : "good"}`}>{n.kind === "price" ? "Ціна" : "Відгук"}</span>
            <span style={{ fontWeight: n.read ? 400 : 700 }}>{n.slug ? <Link href={`/cars/${n.slug}`}>{n.text}</Link> : n.text}</span>
            <span className="small muted">{new Date(n.created_at).toLocaleDateString("uk-UA")}</span>
          </li>
        ))}</ul>
      )}
    </section>
  );
}
