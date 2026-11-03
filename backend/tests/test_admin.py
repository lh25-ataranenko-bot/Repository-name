def auth(client, admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def test_full_edit_validation(client, admin_token):
    h = auth(client, admin_token)
    # mpg-like consumption and inverted years are rejected
    assert client.patch("/api/admin/cars/mazda-6-gj-25", headers=h, json={"cons_real": 32}).status_code == 422
    assert client.patch("/api/admin/cars/mazda-6-gj-25", headers=h, json={"year_from": 2030}).status_code == 422
    r = client.patch("/api/admin/cars/mazda-6-gj-25", headers=h, json={"engine_code": "PY-VPS (рест.)", "assists": ["AEB"]}).json()
    assert set(r["changed"]) == {"engine_code", "assists"} and r["status"] == "partial"  # non-critical: status kept
    # clearing a value with explicit null is allowed
    r = client.patch("/api/admin/cars/mazda-6-gj-25", headers=h, json={"vmax": None}).json()
    assert client.get("/api/cars/mazda-6-gj-25").json()["vmax"] is None


def test_review_then_critical_edit_resets_status(client, admin_token):
    h = auth(client, admin_token)
    assert client.post("/api/admin/cars/honda-civic-x-15t/review", headers=h).json()["status"] == "verified"
    r = client.patch("/api/admin/cars/honda-civic-x-15t", headers=h, json={"price": 16000}).json()
    assert r["status"] == "partial"
    r = client.patch("/api/admin/cars/honda-civic-x-15t", headers=h, json={"price": 16100, "status": "verified"}).json()
    assert r["status"] == "verified"


def test_issues_replace(client, admin_token):
    h = auth(client, admin_token)
    body = [{"part": "Помпа", "frequency": "іноді", "cost": 300}, {"part": "Стійки", "frequency": "часто", "cost": 60}]
    assert client.put("/api/admin/cars/skoda-fabia-nj-10tsi/issues", headers=h, json=body).json()["issues"] == 2
    car = client.get("/api/cars/skoda-fabia-nj-10tsi").json()
    assert [i["part"] for i in car["issues"]] == ["Помпа", "Стійки"]
    bad = [{"part": "X", "frequency": "завжди", "cost": 1}]
    assert client.put("/api/admin/cars/skoda-fabia-nj-10tsi/issues", headers=h, json=bad).status_code == 422


def test_create_and_delete(client, admin_token):
    h = auth(client, admin_token)
    body = {"brand": "Opel", "model": "Astra", "generation": "K", "name": "1.6 CDTI МКП-6", "body": "hatch",
            "fuel": "diesel", "trans_type": "manual", "drive": "FWD", "hp": 136, "year_from": 2015, "year_to": 2021}
    r = client.post("/api/admin/cars", headers=h, json=body)
    assert r.status_code == 201
    slug = r.json()["slug"]
    car = client.get(f"/api/cars/{slug}").json()
    assert car["status"] == "unverified" and car["price"] is None
    assert client.post("/api/admin/cars", headers=h, json=body).status_code == 409
    assert client.delete(f"/api/cars/{slug}").status_code == 405
    assert client.delete(f"/api/admin/cars/{slug}", headers=h).status_code == 204
    assert client.get(f"/api/cars/{slug}").status_code == 404


def test_roles(client, admin_token):
    h = auth(client, admin_token)
    r = client.post("/api/auth/register", json={"email": "editor@example.com", "password": "secret123"})
    eh = {"Authorization": f"Bearer {r.json()['token']}"}
    uid = r.json()["user"]["id"]
    assert client.get("/api/admin/quality", headers=eh).status_code == 403
    assert client.patch(f"/api/admin/users/{uid}", headers=h, json={"role": "editor"}).json()["role"] == "editor"
    assert client.get("/api/admin/quality", headers=eh).status_code == 200
    assert client.get("/api/admin/users", headers=eh).status_code == 403  # editors cannot manage roles
    assert client.delete("/api/admin/cars/mazda-6-gj-25", headers=eh).status_code == 403  # nor delete
    me = client.get("/api/me", headers=h).json()
    assert client.patch(f"/api/admin/users/{me['id']}", headers=h, json={"role": "user"}).status_code == 409
