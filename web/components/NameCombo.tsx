"use client";

import { useEffect, useId, useRef, useState } from "react";
import { api } from "@/lib/api";

export interface Suggestion {
  type: "brand" | "model"; brand: string; model?: string; label: string; score: number;
  alias?: string | null; years?: string | null; models?: number; modifications?: number;
}

/**
 * Text field with suggestions, like the brand and model fields of car marketplaces: type in Latin or
 * Cyrillic, Ukrainian or Russian, with typos or the wrong keyboard layout ("камри", "сфькн", "octvia").
 * Leaving the field with text that clearly names something selects it; an empty field clears the choice.
 */
export function NameCombo({ id, label, value, placeholder, params, onPick, onClear, filter }: {
  id: string; label: string; value: string; placeholder: string;
  params: Record<string, string>; onPick: (s: Suggestion) => void; onClear: () => void;
  filter?: (s: Suggestion) => boolean;
}) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);
  const listId = useId();
  const box = useRef<HTMLDivElement>(null);
  const typed = useRef(false);

  useEffect(() => { if (!open) setText(value); }, [value, open]);
  useEffect(() => {
    if (!open) return;
    const q = typed.current ? text : "";
    const t = setTimeout(() => api<Suggestion[]>(`/api/suggest?${new URLSearchParams({ ...params, q, limit: "30" })}`)
      .then((h) => { setHits(filter ? h.filter(filter) : h); setActive(0); }).catch(() => setHits([])), q ? 120 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, open, JSON.stringify(params)]);

  const pick = (s: Suggestion) => { typed.current = false; onPick(s); setOpen(false); };
  const leave = () => {
    if (!open) return;
    setOpen(false);
    if (!typed.current) return;
    typed.current = false;
    if (!text.trim()) onClear();
    // typed a recognisable name and moved on: a strong match, or one clearly ahead of the others ("octvia")
    else if (hits[0] && (hits[0].score >= 85 || (hits[0].score >= 30 && (!hits[1] || hits[0].score - hits[1].score >= 15)))) onPick(hits[0]);
    else setText(value);
  };
  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) leave(); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  });
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, hits.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && open) { e.preventDefault(); if (hits[active]) pick(hits[active]); else leave(); }
    else if (e.key === "Escape") { typed.current = false; setOpen(false); setText(value); }
    else if (e.key === "Tab") leave();
  };

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="picker" ref={box}>
        <input id={id} role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" autoComplete="off"
          aria-activedescendant={open && hits[active] ? `${listId}-${active}` : undefined}
          value={text} placeholder={placeholder}
          onFocus={(e) => { setOpen(true); e.target.select(); }}
          onChange={(e) => { typed.current = true; setText(e.target.value); setOpen(true); }} onKeyDown={onKey} />
        {value && <button type="button" className="combo-clear" aria-label={`Очистити: ${label}`}
          onClick={() => { typed.current = false; setText(""); onClear(); }}>×</button>}
        {open && (
          <ul className="picker-list" id={listId} role="listbox" aria-label={label}>
            {hits.map((h, i) => (
              <li key={h.label} id={`${listId}-${i}`} role="option" aria-selected={i === active} className={i === active ? "on" : ""}
                onMouseDown={(e) => { e.preventDefault(); pick(h); }} onMouseEnter={() => setActive(i)}>
                <b>{h.type === "brand" ? h.brand : params.brand ? h.model : h.label}</b>
                <span className="small muted">
                  {h.type === "brand" ? `марка · моделей: ${h.models}` : [h.alias ? `також ${h.alias}` : "", h.years ?? ""].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
            {!hits.length && <li className="small muted" role="presentation">Нічого не знайдено. Спробуйте іншу назву.</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
