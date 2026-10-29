"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";

export function CarActions({ slug }: { slug: string }) {
  const { compare, toggleCompare, favs, toggleFav } = useStore();
  const inCmp = compare.includes(slug);
  const fav = favs.includes(slug);
  return (
    <div className="row">
      <button className={inCmp ? "btn-primary" : ""} onClick={() => toggleCompare(slug)}>{inCmp ? "✓ У порівнянні" : "+ Порівняти"}</button>
      <button aria-pressed={fav} onClick={() => toggleFav(slug)}>{fav ? "★ В обраному" : "☆ В обране"}</button>
      <Link className="btn" href={`/tco?add=${slug}`}>Розрахувати витрати</Link>
      <Link className="btn" href={`/check?slug=${slug}`}>Перевірити оголошення</Link>
    </div>
  );
}
