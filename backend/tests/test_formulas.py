"""The checks the spec asks for: formulas must move in the right direction."""

from app.services.calc import Env, Overrides, tco
from app.services.listing import decode_vin, market_value
from app.services.query_parser import parse_query
from app.services.scoring import compute_scores, passes, weighted

CAR = {
    "slug": "x", "fuel": "petrol", "price": 20000, "cons_real": 8.0, "cons_pass": 6.5, "maint_per_year": 400,
    "repair_per_year": 300, "depreciation": 0.10, "tank": 50, "acc": 9.0, "reliability": 80, "comfort": 7,
    "ncap": 5, "airbags": 6, "assists": ["AEB"], "trunk": 500, "clearance": 160, "wheelbase": 2700,
    "body": "sedan", "trans_type": "auto", "drive": "FWD", "brand": "Test",
}


def env(**kw):
    e = Env(petrol=58.0, diesel=55.0, kwh=4.3, rate=41.0, km=15000, years=5, other=250)
    for k, v in kw.items():
        setattr(e, k, v)
    return e


def test_fuel_formula():
    r = tco(CAR, env(years=1))
    # F = (D × C / 100) × Q
    assert abs(r.F - 15000 * 8.0 / 100 * 58.0 / 41.0) < 1e-6


def test_tco_identity():
    r = tco(CAR, env())
    assert abs(r.total - (r.P + r.F + r.M + r.R + r.I + r.O - r.S)) < 1e-6


def test_more_mileage_costs_more_fuel():
    assert tco(CAR, env(km=25000)).F > tco(CAR, env(km=10000)).F


def test_lower_resale_raises_tco():
    cheap_resale = tco(CAR, env(), Overrides(dep_pct=20))
    good_resale = tco(CAR, env(), Overrides(dep_pct=5))
    assert cheap_resale.S < good_resale.S
    assert cheap_resale.total > good_resale.total


def test_missing_input_gives_no_result():
    assert tco({**CAR, "maint_per_year": None}, env()) is None


def test_passport_used_only_when_real_missing():
    r = tco({**CAR, "cons_real": None}, env(years=1))
    assert abs(r.F - 15000 * 6.5 / 100 * 58.0 / 41.0) < 1e-6
    assert r.assumptions["consumption_is_real"] is False


def test_budget_is_a_filter_not_a_weight():
    lux = {**CAR, "slug": "lux", "price": 50000, "comfort": 10}
    assert passes(lux, {"max_price": 30000})
    assert not passes(CAR, {"max_price": 30000})


def test_weighted_score_and_missing_categories():
    s, used = weighted({"economy": 80, "dynamics": None, "reliability": 60}, {"economy": 1, "dynamics": 5, "reliability": 1})
    assert s == 70 and used == 2


def test_scores_in_range():
    cars = [CAR, {**CAR, "slug": "y", "acc": 6.0, "cons_real": 10.0, "price": 30000}]
    for sc in compute_scores(cars, env()).values():
        assert all(v is None or 0 <= v <= 100 for v in sc.values())


def test_vin_validation():
    assert decode_vin("WVWZZZ3CZHE00000")["errors"]  # 16 chars
    assert any("I, O" in e for e in decode_vin("WVWZZZ3CZHEO00000")["errors"])
    ok = decode_vin("WVWZZZ3CZHE000000", "Volkswagen", 2017)
    assert ok["errors"] == [] and ok["model_year"] == 2017
    assert decode_vin("WBA8E9C50GK000000", "Toyota", 2016)["errors"]  # brand mismatch


def test_market_value_mileage_direction():
    car = {"price": 20000, "depreciation": 0.1, "year_ref": 2020}
    assert market_value(car, 2020, 50000, "good", 2026)["value"] > market_value(car, 2020, 250000, "good", 2026)["value"]


def test_parse_query():
    p = parse_query("кросовер до 25 тис $ з автоматом для сім'ї", 41.6)
    assert p["filters"] == {"max_price": 25000, "trans": "automatic", "body": "crossover"}
    assert p["preset"] == "family"


def test_production_checks():
    from app.config import Settings, production_problems

    errors, _ = production_problems(Settings(env="production"))
    assert len(errors) == 4  # default secret, admin password, db password, http app url
    ok = Settings(env="production", jwt_secret="x" * 40, admin_password="a-long-admin-pass",
                  database_url="postgresql+psycopg://autowise:S3cret@db:5432/autowise", app_url="https://autowise.ua",
                  smtp_host="smtp.example.com", redis_url="redis://redis:6379/0")
    assert production_problems(ok) == ([], [])
