"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { COLORS, nameOf, shortOf } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Car } from "@/lib/types";

export function CompareTray() {
  const { compare, toggleCompare } = useStore();
  const path = usePathname();
  const [cars, setCars] = useState<Record<string, Car>>({});
  const requested = useRef(new Set<string>()); // each slug is fetched once, even if the request fails

  useEffect(() => {
    const missing = compare.filter((s) => !requested.current.has(s));
    if (!missing.length) return;
    missing.forEach((s) => requested.current.add(s));
    Promise.all(missing.map((s) => api<Car>(`/api/cars/${s}`).catch(() => null))).then((list) =>
      setCars((prev) => ({ ...prev, ...Object.fromEntries(list.filter(Boolean).map((c) => [c!.slug, c!])) })),
    );
  }, [compare]);

  if (!compare.length || path.startsWith("/compare") || path.startsWith("/tco")) return null;
  return (
    <div className="tray">
      <div className="wrap">
        <span className="label">До порівняння:</span>
        <div className="chips">
          {compare.map((s, i) => (
            <span className="chip" key={s}>
              <span className="dot" style={{ background: COLORS[i] }} />
              {cars[s] ? shortOf(cars[s]) : s}
              <button className="icon-btn btn-sm" onClick={() => toggleCompare(s)} aria-label={`Прибрати ${cars[s] ? nameOf(cars[s]) : s}`}>×</button>
            </span>
          ))}
        </div>
        <Link className="btn btn-primary btn-sm" href="/compare">{compare.length < 2 ? "Оберіть ще авто" : `Порівняти (${compare.length})`}</Link>
      </div>
    </div>
  );
}
