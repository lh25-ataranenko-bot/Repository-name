"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Facets } from "@/lib/types";

export interface ModelYear { brand: string; model: string; year: string }

let cached: Promise<Facets> | null = null;
const loadFacets = () => (cached ??= api<Facets>("/api/catalog/facets").catch((e) => { cached = null; throw e; }));

/**
 * Brand → model → production year. The model list works without a brand too: it then shows
 * every model grouped by brand, and choosing one also sets the brand.
 */
export function ModelYearFields({ value, onChange, idPrefix }: { value: ModelYear; onChange: (v: ModelYear) => void; idPrefix: string }) {
  const [facets, setFacets] = useState<Facets | null>(null);
  useEffect(() => { loadFacets().then(setFacets).catch(() => null); }, []);
  const brands = Object.keys(facets?.brands ?? {});
  const years = facets?.year_min && facets.year_max
    ? Array.from({ length: facets.year_max - facets.year_min + 1 }, (_, i) => facets.year_max! - i) : [];
  const modelValue = value.model ? `${value.brand}|${value.model}` : "";

  return (
    <>
      <div className="field"><label htmlFor={`${idPrefix}-brand`}>Марка</label>
        <select id={`${idPrefix}-brand`} value={value.brand} onChange={(e) => onChange({ ...value, brand: e.target.value, model: "" })}>
          <option value="">Усі марки</option>
          {brands.map((b) => <option key={b} value={b}>{b}</option>)}
        </select></div>
      <div className="field"><label htmlFor={`${idPrefix}-model`}>Модель</label>
        <select id={`${idPrefix}-model`} value={modelValue} onChange={(e) => {
          const [brand, model] = e.target.value ? e.target.value.split("|") : [value.brand, ""];
          onChange({ ...value, brand, model });
        }}>
          <option value="">{value.brand ? `Усі моделі ${value.brand}` : "Усі моделі"}</option>
          {(value.brand ? [value.brand] : brands).map((b) => (
            <optgroup key={b} label={b}>
              {(facets?.brands[b] ?? []).map((m) => <option key={m} value={`${b}|${m}`}>{m}</option>)}
            </optgroup>
          ))}
        </select></div>
      <div className="field"><label htmlFor={`${idPrefix}-year`}>Рік випуску</label>
        <select id={`${idPrefix}-year`} value={value.year} onChange={(e) => onChange({ ...value, year: e.target.value })}>
          <option value="">Будь-який</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select></div>
    </>
  );
}
