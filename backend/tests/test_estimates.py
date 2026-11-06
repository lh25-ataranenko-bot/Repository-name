"""Running costs estimated by class where the catalogue has no data."""

from app.services.estimates import apply, fit


def _car(price, maint=None, repair=None, fuel="petrol"):
    return {"price": price, "fuel": fuel, "maint_per_year": maint, "repair_per_year": repair}


def test_fit_and_apply_within_the_fitted_range():
    known = [_car(p, maint=round(30 * p ** 0.45), repair=round(40 * p ** 0.3)) for p in range(8000, 48000, 4000)]
    model = fit(known)
    cars = [_car(20000), _car(500000), _car(None), _car(20000, fuel="electric")]
    assert apply(cars, model) == 1
    assert cars[0]["estimated"] == ["maint_per_year", "repair_per_year"]
    assert abs(cars[0]["maint_per_year"] - 30 * 20000 ** 0.45) < 15
    assert cars[1]["maint_per_year"] is None  # a $500 000 car is far outside the fitted prices
    assert cars[2]["maint_per_year"] is None and cars[3]["maint_per_year"] is None  # no price; no electric data


def test_api_marks_estimates(client):
    real = client.get("/api/cars/toyota-camry-xv70").json()
    assert real["estimated"] == []
    est = client.get("/api/cars/ford-mustang-vii-s650-2-3-ecoboost-akp-10").json()
    assert est["estimated"] == ["maint_per_year", "repair_per_year"] and est["tco_5y"] is not None
    table = client.post("/api/compare", json={"slugs": ["toyota-camry-xv70", "ford-mustang-vii-s650-2-3-ecoboost-akp-10"]}).json()
    row = next(r for g in table["table"] for r in g["rows"] if r["label"].startswith("ТО на рік"))
    assert "оцінка за класом" in row["values"][1] and "оцінка" not in row["values"][0]
