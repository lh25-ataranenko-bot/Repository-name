"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { TreeBrand } from "@/lib/types";

/** Select grouped by brand: model · generation · modification. */
export function CarPicker({ id, value, onChange, exclude = [], placeholder }: {
  id: string; value?: string; onChange: (slug: string) => void; exclude?: string[]; placeholder?: string;
}) {
  const [tree, setTree] = useState<TreeBrand[]>([]);
  useEffect(() => {
    api<TreeBrand[]>("/api/catalog/tree").then(setTree).catch(() => setTree([]));
  }, []);
  return (
    <select id={id} value={value ?? ""} onChange={(e) => e.target.value && onChange(e.target.value)} style={{ width: "auto", maxWidth: "100%" }}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {tree.map((b) => (
        <optgroup key={b.brand} label={b.brand}>
          {b.models.flatMap((m) => m.generations.flatMap((g) => g.modifications.filter((x) => !exclude.includes(x.slug)).map((x) => (
            <option key={x.slug} value={x.slug}>{m.model} {g.generation} · {x.name}</option>
          ))))}
        </optgroup>
      ))}
    </select>
  );
}
