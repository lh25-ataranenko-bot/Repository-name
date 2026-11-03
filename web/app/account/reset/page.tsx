"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { User } from "@/lib/types";

function Reset() {
  const token = useSearchParams().get("token") ?? "";
  const router = useRouter();
  const { signIn, toast } = useStore();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== repeat) return setError("Паролі не збігаються.");
    try {
      const r = await api<{ token: string; user: User }>("/api/auth/reset", { method: "POST", json: { token, password } });
      signIn(r.token, r.user);
      toast("Пароль змінено. Інші пристрої вийшли з облікового запису.");
      router.push("/account");
    } catch (err) {
      setError((err as Error).message);
    }
  };
  if (!token) return <div className="empty"><b>У посиланні немає коду</b><span>Відкрийте посилання з листа повністю або запросіть новий лист.</span><Link className="btn" href="/account/forgot">Запросити лист</Link></div>;
  return (
    <>
      <div className="page-head"><p className="eyebrow">Кабінет</p><h1>Новий пароль</h1><p>Після зміни пароля всі інші пристрої вийдуть з облікового запису.</p></div>
      <form className="panel stack" style={{ maxWidth: 440 }} onSubmit={submit}>
        <div className="field"><label htmlFor="r-p1">Новий пароль (щонайменше 8 символів)</label><input id="r-p1" type="password" minLength={8} required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <div className="field"><label htmlFor="r-p2">Повторіть пароль</label><input id="r-p2" type="password" minLength={8} required autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} /></div>
        {error && <p className="err">{error}{error.includes("застаріло") && <> <Link href="/account/forgot">Запросити новий лист</Link></>}</p>}
        <button className="btn-primary" type="submit">Зберегти пароль</button>
      </form>
    </>
  );
}

export default function Page() {
  return <Suspense fallback={<p className="loading">Завантаження…</p>}><Reset /></Suspense>;
}
