"""Category scores 0–100 and the weighted rating Score = Σ(wᵢ × sᵢ) / Σwᵢ.

Reliability and comfort are absolute expert indices; the other categories are
normalised min–max across the catalogue (10 = worst, 100 = best).
Mandatory criteria (budget, gearbox, …) are filters, never part of the score.
"""

from typing import Any

from .calc import Car, Env, cost_per_100km, tco

CATEGORIES: list[tuple[str, str]] = [
    ("economy", "Економічність"),
    ("dynamics", "Динаміка"),
    ("reliability", "Надійність"),
    ("comfort", "Комфорт"),
    ("safety", "Безпека"),
    ("practicality", "Практичність"),
    ("tco", "Вартість володіння"),
]
LOWER_BETTER = {"economy", "dynamics", "tco"}
ABSOLUTE = {"reliability", "comfort"}

PRESETS: dict[str, dict[str, Any]] = {
    "balanced": {"name": "Збалансовано", "w": dict(economy=5, dynamics=5, reliability=5, comfort=5, safety=5, practicality=5, tco=5)},
    "city": {"name": "Місто", "w": dict(economy=9, dynamics=3, reliability=7, comfort=5, safety=5, practicality=4, tco=8)},
    "highway": {"name": "Траса", "w": dict(economy=6, dynamics=7, reliability=7, comfort=9, safety=7, practicality=4, tco=5)},
    "family": {"name": "Сім’я", "w": dict(economy=5, dynamics=3, reliability=8, comfort=7, safety=10, practicality=9, tco=6)},
    "sport": {"name": "Активне водіння", "w": dict(economy=3, dynamics=10, reliability=5, comfort=5, safety=6, practicality=3, tco=3)},
    "budget": {"name": "Мінімальні витрати", "w": dict(economy=8, dynamics=2, reliability=8, comfort=3, safety=4, practicality=4, tco=10)},
}


def raw_metrics(car: Car, env: Env) -> dict[str, float | None]:
    five = Env(env.petrol, env.diesel, env.kwh, env.rate, 15000, 5, env.other)
    t = tco(car, five)
    trunk, clr, wb = car.get("trunk"), car.get("clearance"), car.get("wheelbase")
    return {
        "economy": cost_per_100km(car, env),
        "dynamics": car.get("acc"),
        "reliability": car.get("reliability"),
        "comfort": car["comfort"] * 10 if car.get("comfort") is not None else None,
        "safety": car["ncap"] * 12 + (car.get("airbags") or 0) * 2 + len(car.get("assists") or []) * 3
        if car.get("ncap") is not None else None,
        "practicality": trunk / 600 * 50 + clr / 210 * 25 + wb / 2900 * 25
        if None not in (trunk, clr, wb) else None,
        "tco": t.total if t else None,
    }


def compute_scores(cars: list[Car], env: Env) -> dict[str, dict[str, int | None]]:
    raw = {c["slug"]: raw_metrics(c, env) for c in cars}
    scores: dict[str, dict[str, int | None]] = {c["slug"]: {} for c in cars}
    for key, _ in CATEGORIES:
        vals = [r[key] for r in raw.values() if r[key] is not None]
        lo, hi = (min(vals), max(vals)) if vals else (0, 0)
        for slug, r in raw.items():
            v = r[key]
            if v is None:
                scores[slug][key] = None
            elif key in ABSOLUTE:
                scores[slug][key] = round(max(0, min(100, v)))
            else:
                n = 1.0 if hi == lo else (v - lo) / (hi - lo)
                if key in LOWER_BETTER:
                    n = 1 - n
                scores[slug][key] = round(10 + 90 * n)
    return scores


def weighted(score: dict[str, int | None], weights: dict[str, float]) -> tuple[int | None, int]:
    """Returns (score, number of categories actually used)."""
    s = ws = 0.0
    used = 0
    for key, _ in CATEGORIES:
        v, w = score.get(key), weights.get(key, 0)
        if v is not None and w > 0:
            s += w * v
            ws += w
            used += 1
    return (round(s / ws) if ws else None), used


def passes(car: Car, f: dict[str, Any]) -> list[str]:
    """Mandatory filters. Returns the reasons a car is excluded (empty list = passes)."""
    reasons: list[str] = []
    max_price = f.get("max_price")
    if max_price:
        if car.get("price") is None:
            reasons.append("немає даних про ціну")
        elif car["price"] > max_price:
            reasons.append(f"ціна ${car['price']:,.0f} перевищує бюджет ${max_price:,.0f}".replace(",", " "))
    if f.get("body") not in (None, "", "any") and car["body"] != f["body"]:
        reasons.append("інший тип кузова")
    if f.get("fuel") not in (None, "", "any") and car["fuel"] != f["fuel"]:
        reasons.append("інший тип палива")
    if f.get("trans") == "manual" and car["trans_type"] != "manual":
        reasons.append("не механічна КПП")
    if f.get("trans") == "automatic" and car["trans_type"] == "manual":
        reasons.append("механічна КПП")
    if f.get("drive") not in (None, "", "any") and car["drive"] != f["drive"]:
        reasons.append("інший привід")
    if f.get("brand") and car["brand"] != f["brand"]:
        reasons.append("інша марка")
    q = (f.get("q") or "").strip().lower()
    if q:
        hay = " ".join(str(car.get(k) or "") for k in ("brand", "model", "generation", "name", "engine_code")).lower()
        if q not in hay:
            reasons.append("не збігається з пошуком")
    return reasons


def explain(car: Car, score: dict[str, int | None], weights: dict[str, float], used: int,
            max_price: float | None, env: Env) -> list[dict[str, str]]:
    """Concrete reasons behind a rank, not just the total."""
    labels = dict(CATEGORIES)
    out: list[dict[str, str]] = []
    strong = sorted(
        (k for k, _ in CATEGORIES if (score.get(k) or 0) >= 70 and weights.get(k, 0) >= 5),
        key=lambda k: -weights[k] * (score[k] or 0),
    )[:3]
    for k in strong:
        extra = ""
        if k == "economy":
            c100 = cost_per_100km(car, env)
            extra = f" (${c100:.2f} на 100 км)" if c100 else ""
        elif k == "reliability":
            extra = f" (упевненість {car.get('reliability_confidence') or '—'})"
        out.append({"kind": "plus", "text": f"{labels[k]}: {score[k]}/100{extra}"})
    weak = sorted((k for k, _ in CATEGORIES if score.get(k) is not None and score[k] < 45 and weights.get(k, 0) >= 5),
                  key=lambda k: score[k])[:2]
    for k in weak:
        out.append({"kind": "minus", "text": f"Слабке місце: {labels[k].lower()} {score[k]}/100"})
    if max_price and car.get("price") is not None:
        out.append({"kind": "note", "text": f"Запас бюджету: ${max_price - car['price']:,.0f}".replace(",", " ")})
    if used < sum(1 for k, _ in CATEGORIES if weights.get(k, 0) > 0):
        out.append({"kind": "note", "text": "Оцінено не за всіма категоріями: бракує даних"})
    if car.get("reliability_confidence") == "низька":
        out.append({"kind": "note", "text": "Модифікація нова, оцінка надійності попередня"})
    return out
