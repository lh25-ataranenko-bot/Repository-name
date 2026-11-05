import { usd } from "@/lib/format";

/**
 * Forecast of what the car will be worth: value(t) = price × (1 − d)^t for t = 0…10 years from purchase.
 * Drawn as an SVG line with one scale for marks and labels.
 */
export function Residual({ price, dep, buyYear, carYear }: { price: number; dep: number; buyYear: number; carYear: number }) {
  const pts = Array.from({ length: 11 }, (_, t) => ({ t, v: price * Math.pow(1 - dep, t) }));
  const W = 640, H = 200, L = 64, R = 16, T = 16, B = 34;
  const x = (t: number) => L + (t / 10) * (W - L - R);
  const y = (v: number) => T + (1 - v / price) * (H - T - B);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => price * k);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(10)},${y(0)} L${x(0)},${y(0)} Z`;
  const at = (t: number) => pts[t].v;
  return (
    <section className="panel stack">
      <h3>Прогноз залишкової вартості</h3>
      <p className="small muted">Якщо купити авто {carYear} року зараз за {usd(price)}, з урахуванням знецінення {Math.round(dep * 1000) / 10} % на рік.</p>
      <div style={{ overflowX: "auto" }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", minWidth: 420, height: "auto" }} role="img"
          aria-label={`Вартість через 3 роки ${usd(at(3))}, через 5 років ${usd(at(5))}, через 10 років ${usd(at(10))}`}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
              <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{usd(v)}</text>
            </g>
          ))}
          {[0, 2, 4, 6, 8, 10].map((t) => <text key={t} x={x(t)} y={H - 12} textAnchor="middle" fontSize={11} fill="var(--muted)">{buyYear + t}</text>)}
          <path d={area} fill="var(--accent-soft)" stroke="none" />
          <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2.5} />
          {[3, 5, 10].map((t) => (
            <g key={t}>
              <circle cx={x(t)} cy={y(at(t))} r={4.5} fill="var(--needle)" />
              <text x={x(t)} y={y(at(t)) - 10} textAnchor={t === 10 ? "end" : "middle"} fontSize={12} fontWeight={700} fill="var(--ink)">{usd(at(t))}</text>
            </g>
          ))}
        </svg>
      </div>
      <p className="small">Через 3 роки ≈ <b>{usd(at(3))}</b>, через 5 — <b>{usd(at(5))}</b>, через 10 — <b>{usd(at(10))}</b>. Це оцінка: реальна ціна залежить від стану, пробігу й ринку.</p>
    </section>
  );
}
