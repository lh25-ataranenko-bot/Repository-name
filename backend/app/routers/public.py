"""Public API: catalogue, comparison, TCO, rating, smart search, listing check."""

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..schemas import AssistantIn, CheckIn, CompareIn, ParseIn, RatingIn, TcoIn
from ..services import assistant, listing
from ..services.calc import Env, default_inputs, price_for_year, tco
from ..services.cache import Counter, catalog_cache
from ..services.catalog import ASSIST, BODY, DRIVE, FUEL, STATUS, TRANS, comparison_table, load_cars, with_scores
from ..services.query_parser import parse_query
from ..services.scoring import CATEGORIES, PRESETS, explain, passes, weighted

router = APIRouter(prefix="/api", tags=["public"])

def env_key(env: Env) -> tuple:
    # Scores depend on energy prices and the exchange rate, not on mileage or period.
    return (env.petrol, env.diesel, env.kwh, env.rate, env.other)


def scored(db: Session, env: Env | None = None) -> list[dict[str, Any]]:
    """The whole catalogue with scores, from the cache. Treat the returned dicts as read-only."""
    env = env or Env.default()
    return catalog_cache.get(("scored", *env_key(env)), lambda: with_scores(load_cars(db), env))


def index(db: Session, env: Env | None = None) -> dict[str, dict[str, Any]]:
    env = env or Env.default()
    return catalog_cache.get(("index", *env_key(env)), lambda: {c["slug"]: c for c in scored(db, env)})


def pick(db: Session, slugs: list[str], env: Env | None = None) -> list[dict[str, Any]]:
    by = index(db, env)
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


def build_tree(cars: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: dict[str, dict[str, dict[str, list[dict[str, str]]]]] = {}
    for c in cars:
        out.setdefault(c["brand"], {}).setdefault(c["model"], {}).setdefault(c["generation"], []).append(
            {"slug": c["slug"], "name": c["name"]})
    return [
        {"brand": b, "models": [
            {"model": m, "generations": [{"generation": g, "modifications": mods} for g, mods in sorted(gens.items())]}
            for m, gens in sorted(models.items())]}
        for b, models in sorted(out.items())
    ]


@router.get("/catalog/tree")
def tree(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    """Brand → model → generation → modification hierarchy."""
    return catalog_cache.get(("tree",), lambda: build_tree(scored(db)))


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
    model: str | None = Query(None, max_length=80),
    year: int | None = Query(None, ge=1950, le=2100),
    sort: Literal["reliability", "price", "hp", "acc", "cost", "tco"] = "reliability",
    limit: int = Query(48, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    cars = scored(db)
    f = {"q": q, "brand": brand, "model": model, "year": year, "body": body, "fuel": fuel, "trans": trans,
         "drive": drive, "max_price": max_price}
    found = [c for c in cars if not passes(c, f)]
    if year:
        found = [with_year(c, year) for c in found]
    key = SORTS[sort]
    if year and sort == "price":  # sort by the price of a car of that year
        key = lambda c: c["price_for_year"] if c["price_for_year"] is not None else 1e12  # noqa: E731
    found.sort(key=key)
    return {"total": len(cars), "count": len(found), "offset": offset, "limit": limit,
            "items": found[offset:offset + limit]}


def as_of_year(car: dict[str, Any], year: int | None, env: Env | None = None) -> dict[str, Any]:
    """A copy of the car priced as a car of that production year (for comparison and TCO)."""
    if not year:
        return car
    if car["year_from"] and not car["year_from"] <= year <= car["year_to"]:
        raise HTTPException(422, f"{car['brand']} {car['model']} {car['name']} випускалася в {car['year_from']}–{car['year_to']} роках")
    p = price_for_year(car, year)
    c = {**car, "for_year": year, "price_for_year": p}
    if p is not None:
        c["price"] = p
        e = env or Env.default()
        t = tco(c, Env(e.petrol, e.diesel, e.kwh, e.rate, 15000, 5, e.other))  # same 5-year basis as the catalogue
        c["tco_5y"] = t.total if t else None
    return c


def with_year(car: dict[str, Any], year: int) -> dict[str, Any]:
    """A copy of the cached car with the estimated price for that production year."""
    return {**car, "for_year": year, "price_for_year": price_for_year(car, year)}


@router.get("/catalog/facets")
def facets(db: Session = Depends(get_db)) -> dict[str, Any]:
    """Brands with their models, and the range of production years, for the catalogue filters."""
    def build() -> dict[str, Any]:
        cars = scored(db)
        brands: dict[str, set[str]] = {}
        for c in cars:
            brands.setdefault(c["brand"], set()).add(c["model"])
        years = [y for c in cars for y in (c["year_from"], c["year_to"]) if y]
        return {"brands": {b: sorted(m) for b, m in sorted(brands.items())},
                "year_min": min(years) if years else None, "year_max": max(years) if years else None}
    return catalog_cache.get(("facets",), build)


def _model_row(brand: str, model: str, cars: list[dict[str, Any]]) -> dict[str, Any]:
    prices = [c["price"] for c in cars if c["price"] is not None]
    return {
        "brand": brand, "model": model,
        "generations": len({c["generation"] for c in cars}), "modifications": len(cars),
        "year_from": min((c["year_from"] for c in cars if c["year_from"]), default=None),
        "year_to": max((c["year_to"] for c in cars if c["year_to"]), default=None),
        "price_min": min(prices, default=None), "price_max": max(prices, default=None),
        "bodies": sorted({c["body"] for c in cars}), "fuels": sorted({c["fuel"] for c in cars}),
    }


@router.get("/models")
def models(db: Session = Depends(get_db), brand: str | None = Query(None, max_length=80)) -> list[dict[str, Any]]:
    """Every model with its generations count, production years and price range."""
    def build() -> list[dict[str, Any]]:
        by: dict[tuple[str, str], list[dict[str, Any]]] = {}
        for c in scored(db):
            by.setdefault((c["brand"], c["model"]), []).append(c)
        return [_model_row(b, m, cs) for (b, m), cs in sorted(by.items())]
    rows = catalog_cache.get(("models",), build)
    return [r for r in rows if not brand or r["brand"] == brand]


@router.get("/models/{brand}/{model}")
def model_page(brand: str, model: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    """One model: generations on a timeline with their modifications."""
    cars = [c for c in scored(db) if c["brand"] == brand and c["model"] == model]
    if not cars:
        raise HTTPException(404, f"Модель {brand} {model} не знайдено в каталозі")
    gens: dict[str, list[dict[str, Any]]] = {}
    for c in cars:
        gens.setdefault(c["generation"], []).append(c)
    generations = sorted(
        ({"generation": g, "year_from": min(c["year_from"] or 9999 for c in cs), "year_to": max(c["year_to"] or 0 for c in cs),
          "modifications": sorted(cs, key=lambda c: (c["price"] is None, c["price"] or 0))} for g, cs in gens.items()),
        key=lambda g: g["year_from"])
    rel = [c for c in cars if c["reliability"] is not None]
    cheap = [c for c in cars if c.get("tco_5y") is not None]
    return {
        **_model_row(brand, model, cars),
        "generations_list": generations,
        "most_reliable": max(rel, key=lambda c: c["reliability"])["slug"] if rel else None,
        "cheapest_to_own": min(cheap, key=lambda c: c["tco_5y"])["slug"] if cheap else None,
        "other_models": [r["model"] for r in models(db, brand) if r["model"] != model],
    }


@router.get("/cars/lookup")
def lookup(db: Session = Depends(get_db), q: str = Query("", max_length=100),
           limit: int = Query(20, ge=1, le=50)) -> list[dict[str, Any]]:
    """Light search for pickers: every word must match brand, model, generation, name or engine code."""
    words = q.lower().split()
    out = []
    for c in scored(db):
        hay = f"{c['brand']} {c['model']} {c['generation']} {c['name']} {c['engine_code'] or ''}".lower()
        if all(w in hay for w in words):
            out.append({k: c[k] for k in ("slug", "brand", "model", "generation", "name", "year_from", "year_to",
                                         "year_ref", "price", "body", "fuel")})
            if len(out) >= limit:
                break
    return out


@router.get("/cars/{slug}")
def get_car(slug: str, db: Session = Depends(get_db),
            year: int | None = Query(None, ge=1950, le=2100)) -> dict[str, Any]:
    car = dict(pick(db, [slug])[0])  # copy: the cached dict is shared between requests
    car["years"] = list(range(car["year_from"], car["year_to"] + 1)) if car["year_from"] and car["year_to"] else []
    car["price_by_year"] = {str(y): price_for_year(car, y) for y in car["years"]}
    car["tco_defaults"] = default_inputs(car)
    if year:
        if car["years"] and year not in car["years"]:
            raise HTTPException(422, f"Ця модифікація випускалася в {car['year_from']}–{car['year_to']} роках")
        car.update(for_year=year, price_for_year=price_for_year(car, year))
        if car["price_for_year"] is not None:
            car["tco_defaults"] = {**car["tco_defaults"], "price": car["price_for_year"],
                                   "ins": round(car["price_for_year"] * 0.03)}
    return car


@router.post("/compare")
def compare(body: CompareIn, db: Session = Depends(get_db)) -> dict[str, Any]:
    env = body.env.to_env()
    cars = [as_of_year(c, body.years.get(c["slug"]), env) for c in pick(db, body.slugs, env)]
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
    cars = [as_of_year(c, body.years.get(c["slug"]), env) for c in pick(db, body.slugs)]
    results = []
    for c in cars:
        ov = body.overrides.get(c["slug"])
        r = tco(c, env, ov.to_overrides() if ov else None)
        results.append({"slug": c["slug"], "name": f"{c['brand']} {c['model']} {c['generation']} {c['name']}",
                        "defaults": default_inputs(c), "consumption_real": c["cons_real"] is not None,
                        "unit": "кВт·год/100 км" if c["fuel"] == "electric" else "л/100 км",
                        "year": c.get("for_year"), "year_ref": c["year_ref"],
                        "years": list(range(c["year_from"], c["year_to"] + 1)) if c["year_from"] and c["year_to"] else [],
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
        ranked.append({"car": with_year(c, f["year"]) if f.get("year") else c, "score": s, "used": used})
    ranked.sort(key=lambda r: -(r["score"] if r["score"] is not None else -1))
    top = ranked[:body.limit]
    for r in top:  # explanations only for what is shown
        r["reasons"] = explain(r["car"], r["car"]["scores"], weights, r["used"], f.get("max_price"), env)
    return {"weights": weights, "ranked": top, "matched": len(ranked),
            "excluded": excluded[:100], "excluded_total": len(excluded)}


@router.post("/search/parse")
def search_parse(body: ParseIn) -> dict[str, Any]:
    return parse_query(body.q, Env.default().rate)


@router.post("/check")
def check(body: CheckIn, db: Session = Depends(get_db)) -> dict[str, Any]:
    car = pick(db, [body.slug])[0]
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


assistant_limit = Counter("assistant", 60)


@router.post("/assistant")
def ask_assistant(body: AssistantIn, request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    if body.messages[-1].role != "user":
        raise HTTPException(422, "Останнє повідомлення має бути від користувача")
    if body.messages[-1].text.strip() == "" or len(body.messages[-1].text) > 1000:
        raise HTTPException(422, "Запитання має містити від 1 до 1000 символів")
    ip = request.client.host if request.client else "unknown"
    fwd = request.headers.get("x-forwarded-for")
    if get_settings().trust_forwarded_for and fwd:
        ip = fwd.split(",")[0].strip()
    if assistant_limit.hit(ip) > get_settings().assistant_per_minute:
        raise HTTPException(429, "Забагато запитань за хвилину. Спробуйте трохи згодом.")
    cars = scored(db)
    history = [t.model_dump() for t in body.messages]
    try:
        out = assistant.ask_claude(history, cars)
    except assistant.AssistantUnavailable as e:
        out = assistant.answer_with_rules(body.messages[-1].text, cars, Env.default(),
                                          f"AI-помічник зараз недоступний ({e}). Показано підбір за правилами.")
    by = index(db)
    out["cars"] = [by[s] for s in out["cars"] if s in by]
    return out


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
