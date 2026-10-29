"""Public API: catalogue, comparison, TCO, rating, smart search, listing check."""

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..schemas import CheckIn, CompareIn, ParseIn, RatingIn, TcoIn
from ..services import listing
from ..services.calc import Env, default_inputs, tco
from ..services.catalog import ASSIST, BODY, DRIVE, FUEL, STATUS, TRANS, comparison_table, load_cars, with_scores
from ..services.query_parser import parse_query
from ..services.scoring import CATEGORIES, PRESETS, explain, passes, weighted

router = APIRouter(prefix="/api", tags=["public"])

def scored(db: Session, env: Env | None = None) -> list[dict[str, Any]]:
    return with_scores(load_cars(db), env or Env.default())

def pick(cars: list[dict[str, Any]], slugs: list[str]) -> list[dict[str, Any]]:
    by = {c["slug"]: c for c in cars}
    missing = [s for s in slugs if s not in by]
    if missing:
        raise HTTPException(404, f"Модифікацію не знайдено: {', '.join(missing)}")
    return [by[s] for s in dict.fromkeys(slugs)]

@router.get("/meta")
def meta() -> dict[str, Any]:
    env = Env.default()
    return {
        "fuel": FUEL, "body": BODY, "drive": DRIVE, "trans": TRANS, "assists": ASSIST, "status": STATUS,
        "categories": CATEGORIES, "presets": PRESETS,
        "env": {**env.__dict__}, "current_year": get_settings().current_year,
    }

@router.get("/catalog/tree")
def tree(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    """Brand → model → generation → modification hierarchy."""
    out: dict[str, dict[str, dict[str, list[dict[str, str]]]]] = {}
    for c in load_cars(db):
        out.setdefault(c["brand"], {}).setdefault(c["model"], {}).setdefault(c["generation"], []).append(
            {"slug": c["slug"], "name": c["name"]})
    return [
        {"brand": b, "models": [
            {"model": m, "generations": [{"generation": g, "modifications": mods} for g, mods in sorted(gens.items())]}
            for m, gens in sorted(models.items())]}
        for b, models in sorted(out.items())
    ]

SORTS = {
    "reliability": lambda c: -(c["reliability"] if c["reliability"] is not None else -1),
    "price": lambda c: c["price"] if c["price"] is not None else 1e12,
    "hp": lambda c: -(c["hp"] or 0),
    "acc": lambda c: c["acc"] if c["acc"] is not None else 99,
    "cost": lambda c: c["cost_per_100km"] if c["cost_per_100km"] is not None else 1e9,
    "tco": lambda c: c["tco_5y"] if c["tco_5y"] is not None else 1e12,
}

@router.get("/cars")
def list_cars(
    db: Session = Depends(get_db),
    q: str | None = Query(None, max_length=100),
    brand: str | None = None,
    body: str | None = None,
    fuel: str | None = None,
    trans: Literal["any", "automatic", "manual"] | None = None,
    drive: str | None = None,
    max_price: float | None = Query(None, ge=0),
    sort: Literal["reliability", "price", "hp", "acc", "cost", "tco"] = "reliability",
) -> dict[str, Any]:
    cars = scored(db)
    f = {"q": q, "brand": brand, "body": body, "fuel": fuel, "trans": trans, "drive": drive, "max_price": max_price}
    items = sorted((c for c in cars if not passes(c, f)), key=SORTS[sort])
    return {"total": len(cars), "count": len(items), "items": items}

@router.get("/cars/{slug}")
def get_car(slug: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    car = pick(scored(db), [slug])[0]
    car["tco_defaults"] = default_inputs(car)
    return car

@router.post("/compare")
def compare(body: CompareIn, db: Session = Depends(get_db)) -> dict[str, Any]:
    env = body.env.to_env()
    cars = pick(scored(db, env), body.slugs)
    equal = PRESETS["balanced"]["w"]
    totals = [weighted(c["scores"], equal)[0] for c in cars]
    summary = []
    for i, c in enumerate(cars):
        leads, weak = [], []
        for k, label in CATEGORIES:
            vals = [x["scores"][k] for x in cars if x["scores"][k] is not None]
            v = c["scores"][k]
            if v is None or not vals:
                continue
            if v == max(vals):
                leads.append(label.lower())
            if v == min(vals) and len(set(vals)) > 1:
                weak.append(label.lower())
        summary.append({"slug": c["slug"], "score": totals[i], "leads": leads, "weak": weak, "tco_5y": c["tco_5y"]})
    best = max(range(len(cars)), key=lambda i: totals[i] or 0)
    return {"cars": cars, "table": comparison_table(cars), "summary": summary, "winner": cars[best]["slug"]}

@router.post("/tco")
def tco_calc(body: TcoIn, db: Session = Depends(get_db)) -> dict[str, Any]:
    env = body.env.to_env()
    cars = pick(load_cars(db), body.slugs)
    results = []
    for c in cars:
        ov = body.overrides.get(c["slug"])
        r = tco(c, env, ov.to_overrides() if ov else None)
        results.append({"slug": c["slug"], "name": f"{c['brand']} {c['model']} {c['name']}",
                        "defaults": default_inputs(c), "consumption_real": c["cons_real"] is not None,
                        "unit": "кВт·год/100 км" if c["fuel"] == "electric" else "л/100 км",
                        "result": r.as_dict() if r else None})
    ok = sorted((r for r in results if r["result"]), key=lambda r: r["result"]["total"])
    cmp = None
    if len(ok) >= 2:
        cmp = {"cheapest": ok[0]["slug"], "most_expensive": ok[-1]["slug"],
               "difference": ok[-1]["result"]["total"] - ok[0]["result"]["total"]}
    return {"env": env.__dict__, "results": results, "comparison": cmp,
            "missing": [r["slug"] for r in results if not r["result"]]}

@router.post("/rating")
def rating(body: RatingIn, db: Session = Depends(get_db)) -> dict[str, Any]:
    env = body.env.to_env()
    weights = dict(PRESETS[body.preset]["w"]) if body.preset in PRESETS else {}
    weights.update({k: max(0, min(10, v)) for k, v in body.weights.items() if k in dict(CATEGORIES)})
    if not weights:
        weights = dict(PRESETS["balanced"]["w"])
    f = body.filters.model_dump()
    ranked, excluded = [], []
    for c in scored(db, env):
        reasons = passes(c, f)
        if reasons:
            excluded.append({"slug": c["slug"], "name": f"{c['brand']} {c['model']} {c['name']}", "reasons": reasons})
            continue
        s, used = weighted(c["scores"], weights)
        ranked.append({"car": c, "score": s, "used": used,
                       "reasons": explain(c, c["scores"], weights, used, f.get("max_price"), env)})
    ranked.sort(key=lambda r: -(r["score"] if r["score"] is not None else -1))
    return {"weights": weights, "ranked": ranked, "excluded": excluded}

@router.post("/search/parse")
def search_parse(body: ParseIn) -> dict[str, Any]:
    return parse_query(body.q, Env.default().rate)

@router.post("/check")
def check(body: CheckIn, db: Session = Depends(get_db)) -> dict[str, Any]:
    car = pick(load_cars(db), [body.slug])[0]
    warnings = []
    if car["year_from"] and not car["year_from"] <= body.year <= car["year_to"]:
        warnings.append(f"Модифікація випускалася в {car['year_from']}–{car['year_to']}, а в оголошенні вказано "
                        f"{body.year} рік. Уточніть покоління і двигун.")
    mv = listing.market_value(car, body.year, body.km, body.condition, get_settings().current_year)
    return {
        "car": {"slug": car["slug"], "name": f"{car['brand']} {car['model']} {car['generation']} {car['name']}",
                "price": car["price"], "year_ref": car["year_ref"]},
        "vin": listing.decode_vin(body.vin, car["brand"], body.year),
        "market": mv,
        "verdict": listing.verdict(body.price, mv) if mv and body.price > 0 else None,
        "warnings": warnings,
        "checklist": listing.checklist(car, body.km),
        "disclaimer": "VIN не гарантує повної історії. Без підтверджених джерел сервіс не може стверджувати, "
                      "що авто не було в ДТП або що пробіг справжній.",
    }

@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
