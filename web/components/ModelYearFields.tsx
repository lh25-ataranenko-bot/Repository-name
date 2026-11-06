"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Facets } from "@/lib/types";
import { NameCombo } from "./NameCombo";

export interface ModelYear { brand: string; model: string; year: string }

let cached: Promise<Facets> | null = null;
const loadFacets = () => (cached ??= api<Facets>("/api/catalog/facets").catch((e) => { cached = null; throw e; }));

/**
 * Brand → model → production year. Brand and model are typed with suggestions in any spelling
 * ("тойота", "камри", "octvia"); a model chosen without a brand also sets the brand.
 */
export function ModelYearFields({ value, onChange, idPrefix }: { value: ModelYear; onChange: (v: ModelYear) => void; idPrefix: string }) {
  const [facets, setFacets] = useState<Facets | null>(null);
  useEffect(() => { loadFacets().then(setFacets).catch(() => null); }, []);
  const years = facets?.year_min && facets.year_max
    ? Array.from({ length: facets.year_max - facets.year_min + 1 }, (_, i) => facets.year_max! - i) : [];

  return (
    <>
      <NameCombo id={`${idPrefix}-brand`} label="Марка" value={value.brand} placeholder="Усі марки, напр. Тойота"
        params={{}} onClear={() => onChange({ ...value, brand: "", model: "" })}
        onPick={(s) => onChange({ ...value, brand: s.brand, model: s.type === "model" ? s.model ?? "" : "" })} />
      <NameCombo id={`${idPrefix}-model`} label="Модель" value={value.model}
        placeholder={value.brand ? `Усі моделі ${value.brand}` : "Усі моделі, напр. Камрі"}
        params={value.brand ? { brand: value.brand } : {}} filter={(s) => s.type === "model"}
        onClear={() => onChange({ ...value, model: "" })}
        onPick={(s) => onChange({ ...value, brand: s.brand, model: s.model ?? "" })} />
      <div className="field"><label htmlFor={`${idPrefix}-year`}>Рік випуску</label>
        <select id={`${idPrefix}-year`} value={value.year} onChange={(e) => onChange({ ...value, year: e.target.value })}>
          <option value="">Будь-який</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select></div>
    </>
  );
}
