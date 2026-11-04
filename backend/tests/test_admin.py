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
    body = {"brand": "Fiat", "model": "Tipo", "generation": "356", "name": "1.4 МКП-6", "body": "hatch",
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


def _xlsx(rows):
    import io

    from openpyxl import Workbook

    wb = Workbook()
    for r in rows:
        wb.active.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_xlsx_import(client, admin_token):
    h = auth(client, admin_token)
    data = _xlsx([
        ["brand", "model", "generation", "modification", "years", "fuel", "hp", "cons", "price"],
        ["Dacia", "Jogger", "I", "1.0 TCe МКП-6", "2022–2025", "petrol", 110, 5.4, 17500],
        ["Toyota", "Camry", "XV70", "2.5 АКП-8", "2018–2021", "petrol", 181, 9.3, 24000],
        [None, None, None, None, None, None, None, None, None],
    ])
    files = {"file": ("cars.xlsx", data, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    rep = client.post("/api/admin/import/xlsx/validate", headers=h, files=files).json()
    assert len(rep["rows"]) == 2 and rep["rows"][0]["errors"] == [] and "дублікат" in rep["rows"][1]["errors"][0]
    assert client.post("/api/admin/import/xlsx/apply", headers=h, files=files).json() == {"added": 1}
    car = client.get("/api/cars/dacia-jogger-i-1-0-tce-мкп-6").json()
    assert car["hp"] == 110 and car["cons_pass"] == 5.4 and car["status"] == "unverified"
    bad = {"file": ("cars.xlsx", b"not a workbook", "application/octet-stream")}
    assert client.post("/api/admin/import/xlsx/validate", headers=h, files=bad).status_code == 422
    csvf = {"file": ("cars.csv", b"a,b", "text/csv")}
    assert client.post("/api/admin/import/xlsx/validate", headers=h, files=csvf).status_code == 422
