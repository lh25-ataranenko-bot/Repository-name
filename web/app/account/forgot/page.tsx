"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";

export default function Forgot() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api("/api/auth/forgot", { method: "POST", json: { email } });
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <>
      <div className="page-head"><p className="eyebrow">Кабінет</p><h1>Відновлення пароля</h1>
        <p>Вкажіть пошту, з якою ви реєструвалися. Ми надішлемо посилання для нового пароля. Посилання діє 1 годину.</p></div>
      {sent ? (
        <div className="empty"><b>Перевірте пошту</b><span>Якщо обліковий запис з адресою {email} існує, лист уже в дорозі. Перевірте також папку «Спам».</span><Link className="btn" href="/account">До входу</Link></div>
      ) : (
        <form className="panel stack" style={{ maxWidth: 440 }} onSubmit={submit}>
          <div className="field"><label htmlFor="f-email">Пошта</label><input id="f-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          {error && <p className="err">{error}</p>}
          <button className="btn-primary" type="submit">Надіслати посилання</button>
          <Link href="/account" className="small">Згадали пароль? Увійти</Link>
        </form>
      )}
    </>
  );
}
