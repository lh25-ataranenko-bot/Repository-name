"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { User } from "@/lib/types";

function Verify() {
  const token = useSearchParams().get("token") ?? "";
  const { user, updateUser } = useStore();
  const [state, setState] = useState<"wait" | "ok" | "error">("wait");
  const [msg, setMsg] = useState("");
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    api<User>("/api/auth/verify", { method: "POST", json: { token } })
      .then((u) => { setState("ok"); if (user && user.id === u.id) updateUser(u); })
      .catch((e) => { setState("error"); setMsg(e.message); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  if (state === "wait") return <p className="loading">Перевіряємо посилання…</p>;
  return state === "ok"
    ? <div className="empty"><b>Пошту підтверджено</b><span>Дякуємо! Тепер можна відновлювати пароль через цю пошту.</span><Link className="btn btn-primary" href="/account">До кабінету</Link></div>
    : <div className="empty"><b>Не вдалося підтвердити пошту</b><span>{msg}</span><Link className="btn" href="/account">До кабінету</Link></div>;
}

export default function Page() {
  return <Suspense fallback={<p className="loading">Завантаження…</p>}><Verify /></Suspense>;
}
