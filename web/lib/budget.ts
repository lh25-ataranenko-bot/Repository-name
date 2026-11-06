/** Budget scale for sliders: fine steps for everyday cars, coarse ones for luxury and supercars.
 *  The last position (0) means "no limit": the API ignores max_price = 0. */
export const BUDGET_STEPS: number[] = (() => {
  const s: number[] = [];
  for (let v = 1000; v < 10000; v += 500) s.push(v);
  for (let v = 10000; v < 50000; v += 1000) s.push(v);
  for (let v = 50000; v < 100000; v += 5000) s.push(v);
  for (let v = 100000; v < 300000; v += 25000) s.push(v);
  for (let v = 300000; v <= 1000000; v += 100000) s.push(v);
  s.push(0);
  return s;
})();

export function budgetIndex(v: number): number {
  if (!v) return BUDGET_STEPS.length - 1;
  let best = 0;
  BUDGET_STEPS.forEach((s, i) => { if (s && Math.abs(s - v) < Math.abs(BUDGET_STEPS[best] - v)) best = i; });
  return best;
}
