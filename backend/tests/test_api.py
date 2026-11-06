def test_catalog_list_and_filters(client):
    r = client.get("/api/cars", params={"fuel": "diesel", "sort": "price"}).json()
    assert r["count"] > 0 and all(c["fuel"] == "diesel" for c in r["items"])
    prices = [c["price"] for c in r["items"]]
    assert prices == sorted(prices)


def test_tree(client):
    tree = client.get("/api/catalog/tree").json()
    bmw = next(b for b in tree if b["brand"] == "BMW")
    assert len(bmw["models"][0]["generations"][0]["modifications"]) == 2


def test_car_detail_and_404(client):
    assert client.get("/api/cars/bmw-f30-320d-xdrive").json()["engine_code"] == "B47D20"
    assert client.get("/api/cars/nope").status_code == 404


def test_compare_no_substitution(client):
    r = client.post("/api/compare", json={"slugs": ["tesla-model3-lr-awd", "nissan-leaf-ze1-40"]}).json()
    torque = next(row for g in r["table"] for row in g["rows"] if row["label"].startswith("Момент"))
    assert torque["values"][0] is None  # Tesla has no published torque → "Немає даних", never a copy
    assert torque["best"] == []


def test_compare_mixed_units_not_ranked(client):
    r = client.post("/api/compare", json={"slugs": ["tesla-model3-lr-awd", "toyota-camry-xv70"]}).json()
    cons = next(row for g in r["table"] for row in g["rows"] if row["label"] == "Витрата (реальна)")
    assert cons["best"] == []


def test_compare_limits(client):
    assert client.post("/api/compare", json={"slugs": ["toyota-camry-xv70"]}).status_code == 422


def test_tco_endpoint(client):
    body = {"slugs": ["toyota-camry-xv70", "skoda-octavia-a7-16tdi"], "env": {"years": 3},
            "overrides": {"toyota-camry-xv70": {"price": 22000}}}
    r = client.post("/api/tco", json=body).json()
    assert r["results"][0]["result"]["P"] == 22000
    assert r["comparison"]["difference"] > 0


def test_rating_filters(client):
    r = client.post("/api/rating", json={"preset": "family", "filters": {"max_price": 20000, "trans": "automatic"}}).json()
    assert all(x["car"]["price"] <= 20000 and x["car"]["trans_type"] != "manual" for x in r["ranked"])
    assert r["excluded"]
    scores = [x["score"] for x in r["ranked"]]
    assert scores == sorted(scores, reverse=True)


def test_check(client):
    r = client.post("/api/check", json={"slug": "vw-passat-b8-20tdi", "year": 2017, "km": 198000,
                                        "price": 13900, "vin": "WVWZZZ3CZHE000000"}).json()
    assert r["verdict"]["level"] in ("good", "warn", "bad")
    assert r["vin"]["errors"] == []
    assert any("DPF" in x for x in r["checklist"]["specific"])


def test_account_flow(client):
    r = client.post("/api/auth/register", json={"email": "user@example.com", "password": "secret123", "name": "Тест"})
    assert r.status_code == 201
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    assert client.put("/api/me/favorites/toyota-camry-xv70", headers=h).status_code == 204
    assert client.get("/api/me/favorites", headers=h).json() == ["toyota-camry-xv70"]
    assert client.post("/api/me/comparisons", headers=h, json={"name": "A vs B", "slugs": ["toyota-camry-xv70", "bmw-f30-320i"]}).status_code == 201
    g = client.post("/api/me/garage", headers=h, json={"slug": "skoda-octavia-a7-16tdi", "name": "Октавія", "start_km": 150000}).json()
    g = client.post(f"/api/me/garage/{g['id']}/entries", headers=h,
                    json={"date": "2026-10-01", "type": "fuel", "cost_uah": 2500, "km": 150600, "note": "45 л"}).json()
    assert g["driven_km"] == 600 and abs(g["per_km_uah"] - 2500 / 600) < 1e-9
    assert client.get("/api/me/garage").status_code == 401
    assert client.get("/api/admin/quality", headers=h).status_code == 403


def test_admin_import_and_patch(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    csv = ("brand,model,generation,modification,years,fuel,hp,cons,price\n"
           "Toyota,Camry,XV70,2.5 АКП-8,2018–2021,petrol,181,9.3,24000\n"
           "Ford,Focus,Mk4,1.0 EcoBoost,2018–2022,petrol,125,32,13500\n"
           "Volkswagen,Golf,Mk8,1.5 eTSI,2020–2024,petrol,150,6.4,21500\n")
    rep = client.post("/api/admin/import/validate", headers=h, json={"csv": csv}).json()
    errs = [r["errors"] for r in rep["rows"]]
    assert "дублікат" in errs[0][0] and "mpg" in " ".join(errs[1]) and errs[2] == []
    assert client.post("/api/admin/import/apply", headers=h, json={"csv": csv}).json() == {"added": 1}
    golf = client.get("/api/cars/volkswagen-golf-mk8-1-5-etsi").json()
    assert golf["status"] == "unverified" and golf["torque"] is None
    r = client.patch("/api/admin/cars/toyota-camry-xv70", headers=h, json={"hp": 200}).json()
    assert r["status"] == "partial"
    log = client.get("/api/admin/changelog", headers=h, params={"slug": "toyota-camry-xv70"}).json()
    assert [e["field"] for e in log[:2]] == ["status", "hp"]


def test_offline_resend_is_idempotent(client):
    r = client.post("/api/auth/register", json={"email": "offline@example.com", "password": "secret123"})
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    g = client.post("/api/me/garage", headers=h, json={"name": "Авто", "start_km": 1000}).json()
    entry = {"date": "2026-11-01", "type": "fuel", "cost_uah": 2000, "km": 1500, "note": "", "client_id": "abc12345-x"}
    client.post(f"/api/me/garage/{g['id']}/entries", headers=h, json=entry)
    g2 = client.post(f"/api/me/garage/{g['id']}/entries", headers=h, json=entry).json()
    assert len(g2["entries"]) == 1 and g2["total_uah"] == 2000
    assert client.post(f"/api/me/garage/{g['id']}/entries", headers=h, json={**entry, "client_id": "bad id!"}).status_code == 422


def test_year_and_model_filters(client):
    r = client.get("/api/cars", params={"brand": "Toyota", "model": "Camry"}).json()
    assert {c["generation"] for c in r["items"]} == {"XV50", "XV70"}
    r = client.get("/api/cars", params={"brand": "Toyota", "model": "Camry", "year": 2014}).json()
    assert [c["slug"] for c in r["items"]] == ["toyota-camry-xv50-25"]
    camry = r["items"][0]
    assert camry["for_year"] == 2014 and camry["price_for_year"] == camry["price"]  # 2014 is the reference year
    older = client.get("/api/cars", params={"brand": "Toyota", "model": "Camry", "year": 2011}).json()["items"][0]
    assert older["price_for_year"] < camry["price"]  # older car of the same modification is cheaper
    # the budget is compared with the price of a car of that year
    cheap = client.get("/api/cars", params={"year": 2011, "max_price": 13000, "model": "Camry"}).json()
    assert cheap["count"] == 1


def test_car_years_and_price_for_year(client):
    c = client.get("/api/cars/toyota-camry-xv70").json()
    assert c["years"] == [2018, 2019, 2020, 2021] and set(c["price_by_year"]) == {"2018", "2019", "2020", "2021"}
    assert c["price_by_year"]["2018"] < c["price_by_year"]["2021"]
    y = client.get("/api/cars/toyota-camry-xv70", params={"year": 2018}).json()
    assert y["tco_defaults"]["price"] == y["price_for_year"] == c["price_by_year"]["2018"]
    assert client.get("/api/cars/toyota-camry-xv70", params={"year": 2010}).status_code == 422


def test_facets(client):
    f = client.get("/api/catalog/facets").json()
    assert "Camry" in f["brands"]["Toyota"] and f["year_min"] <= 2008 and f["year_max"] >= 2024


def test_rating_with_year(client):
    r = client.post("/api/rating", json={"filters": {"year": 2012, "max_price": 12000}}).json()
    assert r["ranked"] and all(x["car"]["year_from"] <= 2012 <= x["car"]["year_to"] for x in r["ranked"])
    assert all(x["car"]["price_for_year"] <= 12000 for x in r["ranked"])


def test_models_and_model_page(client):
    rows = client.get("/api/models", params={"brand": "Toyota"}).json()
    camry = next(r for r in rows if r["model"] == "Camry")
    # years of the whole model line come from the directory; generations from the catalogue
    assert camry["generations"] == 2 and camry["year_from"] == 1982 and camry["in_production"]
    page = client.get("/api/models/Toyota/Camry").json()
    assert [g["generation"] for g in page["generations_list"]] == ["XV50", "XV70"]  # oldest first
    assert page["most_reliable"] and "Camry" not in page["other_models"] and "RAV4" in page["other_models"]
    assert client.get("/api/models/Toyota/Nope").status_code == 404


def test_compare_and_tco_with_years(client):
    base = client.post("/api/compare", json={"slugs": ["toyota-camry-xv70", "toyota-camry-xv50-25"]}).json()
    r = client.post("/api/compare", json={"slugs": ["toyota-camry-xv70", "toyota-camry-xv50-25"],
                                          "years": {"toyota-camry-xv50-25": 2011}}).json()
    old = next(c for c in r["cars"] if c["slug"] == "toyota-camry-xv50-25")
    old_base = next(c for c in base["cars"] if c["slug"] == "toyota-camry-xv50-25")
    assert old["for_year"] == 2011 and old["price"] < old_base["price"] and old["tco_5y"] < old_base["tco_5y"]
    year_row = next(row for g in r["table"] for row in g["rows"] if row["label"] == "Рік, для якого ціна")
    assert "2011" in year_row["values"]
    t = client.post("/api/tco", json={"slugs": ["toyota-camry-xv50-25"], "years": {"toyota-camry-xv50-25": 2011}}).json()
    res = t["results"][0]
    assert res["year"] == 2011 and res["defaults"]["price"] == old["price"] and 2011 in res["years"]
    bad = client.post("/api/tco", json={"slugs": ["toyota-camry-xv50-25"], "years": {"toyota-camry-xv50-25": 2020}})
    assert bad.status_code == 422


def test_tco_credit_and_scenarios(client):
    body = {"slugs": ["toyota-camry-xv70"], "credit": {"down_payment_pct": 20, "rate_pct": 15, "term_months": 48}}
    r = client.post("/api/tco", json=body).json()["results"][0]["result"]
    assert r["C"] > 0 and r["credit"]["monthly_payment"] > 0
    s = client.post("/api/tco/scenarios", json={"slug": "toyota-camry-xv70"}).json()
    rows = {x["label"]: x for x in s["rows"]}
    assert rows["Як зараз"]["diff_per_month"] == 0
    assert rows["Пробіг 30 000 км на рік"]["total"] > rows["Пробіг 10 000 км на рік"]["total"]
    assert rows["Пальне й електроенергія на 20 % дорожчі"]["diff_per_month"] > 0
    assert rows["Ремонти вдвічі дорожчі (ризик)"]["diff_per_month"] > 0


def test_views_and_popular(client, admin_token):
    h1, h2 = {"X-Forwarded-For": "1.1.1.1"}, {"X-Forwarded-For": "2.2.2.2"}
    for _ in range(3):  # the same visitor counts once an hour
        assert client.post("/api/cars/kia-rio-fb-16/view", headers=h1).status_code == 204
    client.post("/api/cars/kia-rio-fb-16/view", headers=h2)
    client.post("/api/cars/mazda-3-bp-20/view", headers=h1)
    top = client.get("/api/popular", params={"limit": 5}).json()
    assert top[0] == {"slug": "kia-rio-fb-16", "views": 2}
    assert client.post("/api/cars/nope/view").status_code == 404
    stats = client.get("/api/admin/popular", headers={"Authorization": f"Bearer {admin_token}"}).json()
    assert stats["per_day"][-1]["views"] >= 3


def test_garage_service_reminder(client):
    from datetime import date, timedelta

    r = client.post("/api/auth/register", json={"email": "service@example.com", "password": "secret123"})
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    g = client.post("/api/me/garage", headers=h, json={"name": "Авто", "start_km": 100000}).json()
    assert g["service"]["due_km"] == 115000 and g["service"]["status"] == "ok"
    # a service entry resets the countdown; driving close to the interval makes it "soon"
    old = (date.today() - timedelta(days=200)).isoformat()
    client.post(f"/api/me/garage/{g['id']}/entries", headers=h, json={"date": old, "type": "service", "cost_uah": 4000, "km": 110000, "note": ""})
    g = client.post(f"/api/me/garage/{g['id']}/entries", headers=h,
                    json={"date": date.today().isoformat(), "type": "fuel", "cost_uah": 2000, "km": 124500, "note": ""}).json()
    s = g["service"]
    assert s["last_km"] == 110000 and s["due_km"] == 125000 and s["km_left"] == 500 and s["status"] == "soon"
    g = client.patch(f"/api/me/garage/{g['id']}", headers=h, json={"service_interval_km": 10000, "service_interval_months": 6}).json()
    assert g["service"]["status"] == "overdue" and g["service"]["km_left"] < 0
    assert client.patch(f"/api/me/garage/{g['id']}", headers=h, json={"service_interval_km": 10}).status_code == 422


def test_similar_cars_same_class_and_price(client):
    r = client.get("/api/cars/toyota-camry-xv70/similar").json()
    assert 1 <= len(r["items"]) <= 6
    lo, hi = r["price_band"]
    models = set()
    for c in r["items"]:
        assert c["body"] in ("sedan", "liftback") and lo <= c["price"] <= hi
        assert c["model"] != "Camry" and (c["brand"], c["model"]) not in models
        models.add((c["brand"], c["model"]))
        assert c["diff"]["price"] == c["price"] - 24000
    assert client.get("/api/cars/nope/similar").status_code == 404


def test_in_production_filter(client):
    all_ = client.get("/api/cars?limit=200").json()
    now = client.get("/api/cars?limit=200&in_production=true").json()
    assert 0 < now["count"] < all_["count"] and all(c["in_production"] for c in now["items"])


def test_directory_of_brands_and_models(client):
    brands = client.get("/api/brands").json()
    assert len(brands) >= 90
    vw = next(b for b in brands if b["brand"] == "Volkswagen")
    assert vw["country"] == "Німеччина" and vw["models"] > vw["models_with_specs"] > 0
    all_models = client.get("/api/models").json()
    assert len(all_models) >= 1400
    with_specs = client.get("/api/models?with_specs=true").json()
    assert 0 < len(with_specs) < len(all_models) and all(m["modifications"] for m in with_specs)
    # a model known only from the directory has a page without generations
    page = client.get("/api/models/Fiat/Panda").json()
    assert page["modifications"] == 0 and page["generations_list"] == [] and page["year_from"] == 1980
    assert page["in_production"] is True and page["year_to"] >= 2026
    # a revived model keeps its break in production
    integra = client.get("/api/models/Acura/Integra").json()
    assert integra["years_note"] == "1986–2006, 2022–досі"
    # catalogue models keep their modifications and get the production years of the whole model line
    golf = client.get("/api/models/Volkswagen/Golf").json()
    assert golf["modifications"] >= 1 and golf["year_from"] == 1974
    assert client.get("/api/models/Fiat/Nope").status_code == 404
