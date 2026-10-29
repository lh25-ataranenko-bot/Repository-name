import { CATS } from "@/lib/format";
import type { Scores } from "@/lib/types";

export function ScoreBars({ series }: { series: { color: string; scores: Scores }[] }) {
  return (
    <div className="scorebars">
      {CATS.map(([k, label]) => (
        <div className="sb-row" key={k}>
          <span className="small">{label}</span>
          <div className="sb-bars">
            {series.map((s, i) => {
              const v = s.scores[k];
              return (
                <div className="sb-bar" key={i}>
                  <div className="track">{v != null && <i style={{ width: `${v}%`, background: s.color }} />}</div>
                  <b>{v ?? "—"}</b>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Dial({ score }: { score: number }) {
  const a = Math.PI * (score / 100);
  const x = 42 - 34 * Math.cos(a);
  const y = 48 - 34 * Math.sin(a);
  return (
    <svg viewBox="0 0 84 56" aria-hidden="true">
      <path className="arc" d="M8 48 A34 34 0 0 1 76 48" />
      {score > 0 && <path className="val" d={`M8 48 A34 34 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}`} />}
      <text className="t" x="42" y="50" textAnchor="middle">{score}</text>
    </svg>
  );
}
