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
