from app.services.customs import CustomsRates, age_coefficient, calculate, excise_eur


def test_age_coefficient_bounds():
    assert age_coefficient(2025, 2026) == 1  # new car: minimum 1
    assert age_coefficient(2016, 2026) == 9
    assert age_coefficient(1990, 2026) == 15  # capped


def test_excise_formulas():
    r = CustomsRates()
    assert excise_eur("petrol", 2000, None, 2016, 2026, r)[0] == 50 * 2.0 * 9
    assert excise_eur("petrol", 3500, None, 2016, 2026, r)[0] == 100 * 3.5 * 9  # over 3000 cm³
    assert excise_eur("diesel", 2000, None, 2016, 2026, r)[0] == 75 * 2.0 * 9
    assert excise_eur("hybrid", 2500, None, 2016, 2026, r)[0] == 100
    assert excise_eur("electric", None, 75, 2021, 2026, r)[0] == 75


def test_vat_includes_duty_and_excise():
    out = calculate(price=10000, currency="USD", delivery=0, production_year=2016, fuel="petrol", cc=2000,
                    battery_kwh=None, eu_origin=False, eur_uah=45.0, usd_uah=40.0, current_year=2026)
    lines = {l["key"]: l for l in out["lines"]}
    value = 10000 * 40
    assert lines["duty"]["uah"] == round(value * 0.10)
    assert lines["excise"]["uah"] == round(50 * 2 * 9 * 45)
    assert lines["vat"]["uah"] == round((value + value * 0.1 + 50 * 2 * 9 * 45) * 0.2)
    assert lines["pension"]["uah"] == round(value * 0.03)


def test_eu_origin_has_no_duty_and_older_car_pays_more_excise():
    kw = dict(price=10000, currency="EUR", delivery=500, fuel="diesel", cc=1968, battery_kwh=None,
              eur_uah=45.0, usd_uah=40.0, current_year=2026)
    eu = calculate(**kw, production_year=2018, eu_origin=True)
    assert next(l for l in eu["lines"] if l["key"] == "duty")["uah"] == 0
    old = calculate(**kw, production_year=2012, eu_origin=True)
    new = calculate(**kw, production_year=2022, eu_origin=True)
    assert old["customs_total"]["uah"] > new["customs_total"]["uah"]


def test_api(client):
    r = client.post("/api/customs", json={"price": 15000, "production_year": 2019, "fuel": "electric", "battery_kwh": 64})
    assert r.status_code == 200 and r.json()["total"]["uah"] > 15000 * 41.6
    assert client.post("/api/customs", json={"price": 15000, "production_year": 2019, "fuel": "petrol"}).status_code == 422
    assert client.post("/api/customs", json={"price": 15000, "production_year": 2030, "fuel": "hybrid"}).status_code == 422
