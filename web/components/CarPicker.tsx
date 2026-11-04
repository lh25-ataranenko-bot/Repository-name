"use client";

import { useEffect, useId, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Car } from "@/lib/types";

type Hit = Pick<Car, "slug" | "brand" | "model" | "generation" | "name" | "year_from" | "year_to">;

/** Search box over the catalogue (server-side, so it works with any catalogue size). */
export function CarPicker({ id, value, onChange, exclude = [], placeholder }: {
  id: string; value?: string; onChange: (slug: string) => void; exclude?: string[]; placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [label, setLabel] = useState("");
  const listId = useId();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!value) return setLabel("");
    api<Car>(`/api/cars/${value}`).then((c) => setLabel(`${c.brand} ${c.model} ${c.generation} · ${c.name}`)).catch(() => setLabel(value));
  }, [value]);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => api<Hit[]>(`/api/cars/lookup?${new URLSearchParams({ q, limit: "20" })}`)
      .then((h) => { setHits(h.filter((x) => !exclude.includes(x.slug))); setActive(0); }).catch(() => setHits([])), 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, open, exclude.join()]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const choose = (h: Hit) => {
    onChange(h.slug);
    setOpen(false);
    setQ("");
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, hits.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && open && hits[active]) { e.preventDefault(); choose(hits[active]); }
    else if (e.key === "Escape") setOpen(false);
  };

  return (
    <div className="picker" ref={box}>
      <input
        id={id} role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" autoComplete="off"
        value={open ? q : label} placeholder={placeholder ?? "Почніть вводити марку або модель"}
        onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onKeyDown={onKey}
      />
      {open && (
        <ul className="picker-list" id={listId} role="listbox">
          {hits.map((h, i) => (
            <li key={h.slug} role="option" aria-selected={i === active} className={i === active ? "on" : ""}
              onMouseDown={(e) => { e.preventDefault(); choose(h); }} onMouseEnter={() => setActive(i)}>
              <b>{h.brand} {h.model} {h.name}</b><span className="small muted">{h.generation} · {h.year_from}–{h.year_to}</span>
            </li>
          ))}
          {!hits.length && <li className="small muted">Нічого не знайдено</li>}
        </ul>
      )}
    </div>
  );
}
