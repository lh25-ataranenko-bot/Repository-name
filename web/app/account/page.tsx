"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CarCard } from "@/components/CarCard";
import { CarPicker } from "@/components/CarPicker";
import { api } from "@/lib/api";
import { nf } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Car, GarageCar, User } from "@/lib/types";

const TYPES: Record<string, string> = { fuel: "Заправка", service: "ТО", repair: "Ремонт", other: "Інше" };

function AuthForm() {
  const { signIn, toast } = useStore();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await api<{ token: string; user: User }>(`/api/auth/${mode}`, { method: "POST", json: mode === "login" ? { email, password } : { email, password, name } });
      signIn(r.token, r.user);
      toast(mode === "login" ? "Ви увійшли" : "Обліковий запис створено");
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <form className="panel stack" style={{ maxWidth: 440 }} onSubmit={submit}>
      <div className="chips">
        <button type="button" className="chip" aria-pressed={mode === "login"} onClick={() => setMode("login")}>Вхід</button>
        <button type="button" className="chip" aria-pressed={mode === "register"} onClick={() => setMode("register")}>Реєстрація</button>
      </div>
      {mode === "register" && <div className="field"><label htmlFor="a-name">Ім’я</label><input id="a-name" value={name} onChange={(e) => setName(e.target.value)} /></div>}
      <div className="field"><label htmlFor="a-email">Пошта</label><input id="a-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
      <div className="field"><label htmlFor="a-pass">Пароль{mode === "register" && " (щонайменше 8 символів)"}</label><input id="a-pass" type="password" required minLength={mode === "register" ? 8 : 1} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} /></div>
      {error && <p className="err">{error}</p>}
      <button className="btn-primary" type="submit">{mode === "login" ? "Увійти" : "Створити обліковий запис"}</button>
      {mode === "login" && <Link href="/account/forgot" className="small">Забули пароль?</Link>}
    </form>
  );
}

function Profile() {
  const { user, updateUser, signIn, toast } = useStore();
  const [name, setName] = useState(user?.name ?? "");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;
  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    updateUser(await api<User>("/api/me", { method: "PATCH", json: { name } }));
    toast("Ім’я збережено");
  };
  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const r = await api<{ token: string; user: User }>("/api/me/password", { method: "POST", json: { current, new: next } });
      signIn(r.token, r.user);
      setCurrent("");
      setNext("");
      toast("Пароль змінено. Інші пристрої вийшли з облікового запису.");
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const resend = async () => {
    await api("/api/auth/resend-verification", { method: "POST" });
    toast(`Лист надіслано на ${user.email}`);
  };
  return (
    <section className="stack">
      <h2>Профіль і безпека</h2>
      {!user.email_verified && (
        <div className="notice">Пошту {user.email} ще не підтверджено. Без цього не вийде відновити пароль. <button className="btn-sm" onClick={resend}>Надіслати лист ще раз</button></div>
      )}
      <div className="split">
        <form className="panel stack" onSubmit={saveName}>
          <h3>Ім’я</h3>
          <div className="field"><label htmlFor="p-name">Як до вас звертатися</label><input id="p-name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <button type="submit" disabled={name === user.name}>Зберегти ім’я</button>
        </form>
        <form className="panel stack" onSubmit={changePassword}>
          <h3>Зміна пароля</h3>
          <div className="field"><label htmlFor="p-cur">Поточний пароль</label><input id="p-cur" type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
          <div className="field"><label htmlFor="p-new">Новий пароль (щонайменше 8 символів)</label><input id="p-new" type="password" required minLength={8} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></div>
          {error && <p className="err">{error}</p>}
          <button type="submit">Змінити пароль</button>
          <p className="small muted">Після зміни пароля всі інші пристрої вийдуть з облікового запису.</p>
        </form>
      </div>
    </section>
  );
}

function Garage() {
  const { toast } = useStore();
  const [list, setList] = useState<GarageCar[]>([]);
  const [slug, setSlug] = useState("skoda-octavia-a7-16tdi");
  const [name, setName] = useState("");
  const [startKm, setStartKm] = useState(150000);
  const load = useCallback(() => api<GarageCar[]>("/api/me/garage").then(setList).catch(() => null), []);
  useEffect(() => { load(); }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    await api("/api/me/garage", { method: "POST", json: { slug, name: name || "Моє авто", start_km: startKm } });
    setName("");
    toast("Авто додано в гараж");
    load();
  };
  const addEntry = async (gid: number, form: HTMLFormElement) => {
    const fd = new FormData(form);
    await api(`/api/me/garage/${gid}/entries`, { method: "POST", json: {
      date: new Date().toISOString().slice(0, 10), type: fd.get("type"), cost_uah: Number(fd.get("cost")) || 0,
      km: Number(fd.get("km")) || 0, note: String(fd.get("note") ?? ""),
    } });
    toast("Запис додано");
    load();
  };
  const remove = async (gid: number) => { await api(`/api/me/garage/${gid}`, { method: "DELETE" }); toast("Авто видалено з гаража"); load(); };

  return (
    <section className="stack">
      <h2>Мій гараж</h2>
      <form className="panel" onSubmit={add}><div className="fields" style={{ alignItems: "end" }}>
        <div className="field" style={{ gridColumn: "span 2" }}><label htmlFor="g-car">Модифікація</label><CarPicker id="g-car" value={slug} onChange={setSlug} /></div>
        <div className="field"><label htmlFor="g-name">Назва</label><input id="g-name" placeholder="Наприклад, «Робоча Октавія»" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label htmlFor="g-km">Поточний пробіг, км</label><input id="g-km" type="number" min={0} step={1000} value={startKm} onChange={(e) => setStartKm(+e.target.value)} /></div>
        <button className="btn-primary" type="submit">Додати в гараж</button>
      </div></form>
      {!list.length && <div className="empty"><b>Гараж порожній</b><span>Додайте своє авто, щоб вести облік заправок, ТО і ремонтів та бачити реальну вартість кілометра.</span></div>}
      {list.map((g) => (
        <div className="panel stack" key={g.id}>
          <div className="spread"><div><h3>{g.name}</h3><p className="small muted">{g.modification?.name ?? "—"} · старт {nf(g.start_km)} км</p></div>
            <button className="btn-sm btn-ghost" onClick={() => remove(g.id)}>Видалити авто</button></div>
          <div className="stats">
            <div className="stat"><span className="label">Витрачено</span><span className="big-num">{nf(g.total_uah)} грн</span></div>
            <div className="stat"><span className="label">Пройдено</span><span className="big-num">{nf(g.driven_km)} км</span></div>
            <div className="stat"><span className="label">Вартість 1 км</span><span className="big-num">{g.per_km_uah != null ? `${nf(g.per_km_uah, 2)} грн` : "—"}</span></div>
            <div className="stat"><span className="label">Пальне / ТО / ремонт</span><span className="num small">{nf(g.by_type.fuel ?? 0)} / {nf(g.by_type.service ?? 0)} / {nf(g.by_type.repair ?? 0)} грн</span></div>
          </div>
          <form className="fields" style={{ alignItems: "end" }} onSubmit={(e) => { e.preventDefault(); addEntry(g.id, e.currentTarget); e.currentTarget.reset(); }}>
            <div className="field"><label htmlFor={`ge-type-${g.id}`}>Запис</label><select id={`ge-type-${g.id}`} name="type">{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div className="field"><label htmlFor={`ge-cost-${g.id}`}>Сума, грн</label><input id={`ge-cost-${g.id}`} name="cost" type="number" min={0} step={10} required /></div>
            <div className="field"><label htmlFor={`ge-km-${g.id}`}>Пробіг, км</label><input id={`ge-km-${g.id}`} name="km" type="number" min={0} defaultValue={g.current_km} /></div>
            <div className="field"><label htmlFor={`ge-note-${g.id}`}>Примітка</label><input id={`ge-note-${g.id}`} name="note" placeholder="45 л, А-95" /></div>
            <button type="submit">Додати запис</button>
          </form>
          {g.entries.length ? (
            <div className="tbl-wrap"><table>
              <thead><tr><th>Дата</th><th>Тип</th><th className="n">Пробіг</th><th className="n">Сума</th><th>Примітка</th></tr></thead>
              <tbody>{[...g.entries].reverse().map((e) => <tr key={e.id}><td className="num small">{e.date}</td><td>{TYPES[e.type]}</td><td className="n">{nf(e.km)}</td><td className="n">{nf(e.cost_uah)} грн</td><td className="small">{e.note}</td></tr>)}</tbody>
            </table></div>
          ) : <p className="small muted">Записів ще немає. Додайте першу заправку або ТО.</p>}
        </div>
      ))}
    </section>
  );
}

export default function Account() {
  const { user, signOut, favs, setCompare, ready, toast } = useStore();
  const router = useRouter();
  const [favCars, setFavCars] = useState<Car[]>([]);
  const [saved, setSaved] = useState<{ id: number; name: string; slugs: string[]; created_at: string }[]>([]);

  useEffect(() => {
    Promise.all(favs.map((s) => api<Car>(`/api/cars/${s}`).catch(() => null))).then((l) => setFavCars(l.filter(Boolean) as Car[]));
  }, [favs]);
  const loadSaved = useCallback(() => { if (user) api<typeof saved>("/api/me/comparisons").then(setSaved).catch(() => null); }, [user]);
  useEffect(() => { loadSaved(); }, [loadSaved]);

  if (!ready) return <p className="loading">Завантаження…</p>;
  return (
    <>
      <div className="page-head"><p className="eyebrow">Особистий кабінет</p><h1>Кабінет</h1>
        <p>{user ? <>Ви увійшли як <b>{user.email}</b>. <button className="btn-sm btn-ghost" onClick={signOut}>Вийти</button></> : "Увійдіть, щоб зберігати порівняння, синхронізувати обране між пристроями та вести гараж."}</p></div>
      <div className="stack-lg">
        {!user && <AuthForm />}
        <section className="stack"><h2>Обране</h2>
          {favCars.length ? <div className="cards">{favCars.map((c) => <CarCard key={c.slug} car={c} />)}</div>
            : <div className="empty"><b>Тут з’являться обрані модифікації</b><span>Натисніть ☆ на картці авто в каталозі.</span><Link className="btn" href="/catalog">Відкрити каталог</Link></div>}
        </section>
        {user && (
          <section className="stack"><h2>Збережені порівняння</h2>
            {saved.length ? (
              <div className="tbl-wrap"><table>
                <thead><tr><th>Назва</th><th>Автомобілі</th><th>Дата</th><th /></tr></thead>
                <tbody>{saved.map((s) => (
                  <tr key={s.id}><td><b>{s.name}</b></td><td className="small">{s.slugs.join(" · ")}</td><td className="small muted num">{s.created_at.slice(0, 10)}</td>
                    <td><div className="row" style={{ justifyContent: "flex-end" }}>
                      <button className="btn-sm" onClick={() => { setCompare(s.slugs.slice(0, 5)); router.push("/compare"); }}>Відкрити</button>
                      <button className="btn-sm btn-ghost" onClick={async () => { await api(`/api/me/comparisons/${s.id}`, { method: "DELETE" }); toast("Порівняння видалено"); loadSaved(); }}>Видалити</button>
                    </div></td></tr>
                ))}</tbody>
              </table></div>
            ) : <div className="empty"><b>Збережених порівнянь поки немає</b><span>У розділі «Порівняння» натисніть «Зберегти порівняння».</span></div>}
          </section>
        )}
        {user && <Garage />}
        {user && <Profile />}
      </div>
    </>
  );
}
