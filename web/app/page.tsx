import Link from "next/link";
import { CarCard } from "@/components/CarCard";
import { api } from "@/lib/api";
import type { Car } from "@/lib/types";
import { QuickPick, SmartSearch } from "./home-forms";

const POPULAR = ["toyota-rav4-xa50-hybrid", "skoda-octavia-a8-15tsi", "bmw-f30-320d-xdrive", "mazda-cx5-kf-25awd"];

export default async function Home() {
  const cars = (await Promise.all(POPULAR.map((s) => api<Car>(`/api/cars/${s}`).catch(() => null)))).filter(Boolean) as Car[];
  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">Порівняння конкретних модифікацій</p>
          <h1>Оберіть авто за фактами, а не за враженнями</h1>
          <p className="lead">Порівнюйте конкретні версії з точним двигуном, коробкою передач і роками випуску. Рахуйте повну вартість володіння та дізнавайтеся, які вузли саме цієї модифікації ламаються найчастіше.</p>
          <SmartSearch />
        </div>
        <QuickPick />
      </section>

      <section className="stack" style={{ marginTop: 44 }}>
        <div className="spread"><h2>Популярні модифікації</h2><Link href="/catalog">Весь каталог →</Link></div>
        <div className="cards">{cars.map((c) => <CarCard key={c.slug} car={c} />)}</div>
      </section>

      <section className="stack" style={{ marginTop: 44 }}>
        <h2>Як проходить підбір</h2>
        <ol className="steps">
          {[
            ["Задайте умови", "Бюджет, кузов, паливо, коробка, привід і призначення."],
            ["Отримайте список", "Модифікації, відсортовані за вашими пріоритетами."],
            ["Додайте 2–5 версій", "Порівняння конкретних двигунів і років."],
            ["Перегляньте різницю", "Таблиця, графіки, переваги й недоліки."],
            ["Порахуйте витрати", "Ваш пробіг, ціна пального, строк володіння."],
            ["Збережіть рішення", "У кабінеті або перейдіть до перевірки оголошення."],
          ].map(([t, d]) => <li key={t}><b>{t}</b><span className="small muted">{d}</span></li>)}
        </ol>
      </section>

      <section style={{ marginTop: 44 }} className="principles">
        <div><h4>«Немає даних» замість здогадок</h4><p className="small muted">Якщо характеристики немає, ми не підставляємо значення іншої модифікації.</p></div>
        <div><h4>Паспорт окремо від реальності</h4><p className="small muted">Паспортна й реальна витрата позначені окремо і не змішуються.</p></div>
        <div><h4>Видимі припущення</h4><p className="small muted">Кожну цифру в калькуляторі можна змінити, а формула показана повністю.</p></div>
        <div><h4>Джерело і дата</h4><p className="small muted">Кожна модифікація має джерело, дату оновлення і статус перевірки.</p></div>
      </section>
    </>
  );
}
