"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";

export function AdminGate({ children }: { children: React.ReactNode }) {
  const { user, ready } = useStore();
  if (!ready) return <p className="loading">Завантаження…</p>;
  if (!user || user.role === "user") {
    return <div className="empty"><b>Адмінпанель доступна редакторам і адміністраторам</b><span>Увійдіть під обліковим записом із правами редактора.</span><Link className="btn" href="/account">Увійти</Link></div>;
  }
  return <>{children}</>;
}
