"use client";

import { BUDGET_STEPS, budgetIndex } from "@/lib/budget";
import { usd } from "@/lib/format";

/** Price limit: a slider from $1 000 to $1 000 000 (then "no limit") and a field for an exact amount. 0 = no limit. */
export function BudgetField({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}: <b>{value ? usd(value) : "без обмеження"}</b></label>
      <input type="range" id={id} min={0} max={BUDGET_STEPS.length - 1} step={1} value={budgetIndex(value)}
        aria-valuetext={value ? usd(value) : "без обмеження"} onChange={(e) => onChange(BUDGET_STEPS[+e.target.value])} />
      <input type="number" aria-label={`${label}, точна сума в доларах`} min={0} step={500} placeholder="Без обмеження"
        value={value || ""} onChange={(e) => onChange(Math.max(0, Math.round(+e.target.value || 0)))} />
    </div>
  );
}
