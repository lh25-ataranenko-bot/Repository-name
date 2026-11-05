"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

/** Unread notices counter in the header (checked on navigation). */
export function Bell() {
  const { user } = useStore();
  const path = usePathname();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!user) return setN(0);
    api<{ unread: number }>("/api/me/notifications").then((d) => setN(d.unread)).catch(() => null);
  }, [user, path]);
  if (!user || !n) return null;
  return <Link className="btn btn-sm" href="/account#notifications" aria-label={`Нових сповіщень: ${n}`}>
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
    <span className="badge" style={{ marginLeft: 2 }}>{n}</span></Link>;
}
