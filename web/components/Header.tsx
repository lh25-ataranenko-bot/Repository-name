"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import { Bell } from "./Bell";

const LINKS = [
  ["/", "Головна"], ["/catalog", "Каталог"], ["/models", "Моделі"], ["/compare", "Порівняння"], ["/tco", "Калькулятор"], ["/customs", "Розмитнення"],
  ["/rating", "Рейтинг"], ["/assistant", "AI-помічник"], ["/check", "Аналіз оголошення"], ["/account", "Кабінет"],
];

export function Header() {
  const path = usePathname();
  const { compare, user } = useStore();
  const links = user && user.role !== "user" ? [...LINKS, ["/admin", "Адмінпанель"]] : LINKS;
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <header className="top">
      <div className="wrap">
        <Link className="logo" href="/" aria-label="AutoWise — головна">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <path className="g-arc" d="M5 22 A12 12 0 1 1 27 22" />
            <path className="g-val" d="M5 22 A12 12 0 0 1 22 7" />
            <line className="g-needle" x1="16" y1="18" x2="23" y2="10" />
          </svg>
          AutoWise
        </Link>
        <nav className="tabs" aria-label="Розділи">
          {links.map(([href, label]) => (
            <Link key={href} href={href} aria-current={active(href) ? "page" : undefined}>
              {label}
              {href === "/compare" && compare.length > 0 && <span className="badge">{compare.length}</span>}
            </Link>
          ))}
        </nav>
        <div className="acct">
          <Bell />
          {user ? <Link className="btn btn-sm btn-ghost" href="/account">{user.name || user.email}</Link>
                : <Link className="btn btn-sm" href="/account">Увійти</Link>}
        </div>
      </div>
    </header>
  );
}
