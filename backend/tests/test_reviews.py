def register(client, email, name="Олег Петренко"):
    r = client.post("/api/auth/register", json={"email": email, "password": "secret123", "name": name})
    return {"Authorization": f"Bearer {r.json()['token']}"}


GOOD = {"rating": 4, "pros": "Економний дизель, просторий салон", "cons": "Дорогий сажовий фільтр", "car_year": 2017,
        "owned_years": 3, "mileage_km": 180000}


def test_review_flow(client, admin_token):
    h = register(client, "owner1@example.com")
    admin = {"Authorization": f"Bearer {admin_token}"}
    slug = "vw-passat-b8-20tdi"
    assert client.put(f"/api/cars/{slug}/reviews/mine", json=GOOD).status_code == 401
    r = client.put(f"/api/cars/{slug}/reviews/mine", headers=h, json=GOOD).json()
    assert r["status"] == "pending"
    # not visible before moderation
    assert client.get(f"/api/cars/{slug}/reviews").json()["count"] == 0
    queue = client.get("/api/admin/reviews", headers=admin).json()
    assert any(x["id"] == r["id"] for x in queue)
    assert client.get("/api/admin/reviews", headers=h).status_code == 403
    assert client.patch(f"/api/admin/reviews/{r['id']}", headers=admin, json={"status": "rejected"}).status_code == 422
    client.patch(f"/api/admin/reviews/{r['id']}", headers=admin, json={"status": "published"})
    pub = client.get(f"/api/cars/{slug}/reviews").json()
    assert pub["count"] == 1 and pub["average"] == 4.0 and pub["items"][0]["author"] == "Олег"
    assert "email" not in pub["items"][0]
    # editing sends it back to moderation, still one review per user and car
    r2 = client.put(f"/api/cars/{slug}/reviews/mine", headers=h, json={**GOOD, "rating": 2}).json()
    assert r2["id"] == r["id"] and r2["status"] == "pending"
    assert client.get(f"/api/cars/{slug}/reviews").json()["count"] == 0
    mine = client.get("/api/me/reviews", headers=h).json()
    assert len(mine) == 1 and mine[0]["status"] == "pending" and mine[0]["slug"] == slug
    assert client.delete(f"/api/me/reviews/{r['id']}", headers=h).status_code == 204


def test_review_validation(client):
    h = register(client, "owner2@example.com")
    slug = "toyota-camry-xv70"
    assert client.put(f"/api/cars/{slug}/reviews/mine", headers=h, json={**GOOD, "pros": "ok", "cons": ""}).status_code == 422
    assert client.put(f"/api/cars/{slug}/reviews/mine", headers=h, json={**GOOD, "rating": 6}).status_code == 422
    assert client.put(f"/api/cars/{slug}/reviews/mine", headers=h, json={**GOOD, "car_year": 2010}).status_code == 422
    other = register(client, "owner3@example.com")
    rid = client.put(f"/api/cars/{slug}/reviews/mine", headers=h, json={**GOOD, "car_year": 2019}).json()["id"]
    assert client.delete(f"/api/me/reviews/{rid}", headers=other).status_code == 404


def test_favourite_notifications(client, admin_token):
    from app.services import mailer

    admin = {"Authorization": f"Bearer {admin_token}"}
    fan = register(client, "fan@example.com", "Марко")
    author = register(client, "author@example.com", "Ольга")
    slug = "skoda-superb-b8-20tdi"
    for h in (fan, author):
        client.put(f"/api/me/favorites/{slug}", headers=h)
    price = client.get(f"/api/cars/{slug}").json()["price"]
    client.patch(f"/api/admin/cars/{slug}", headers=admin, json={"price": price - 1000})
    n = client.get("/api/me/notifications", headers=fan).json()
    assert n["unread"] == 1 and n["items"][0]["kind"] == "price" and "ціна змінилася" in n["items"][0]["text"]
    # a review notifies the other fans, not its author
    rid = client.put(f"/api/cars/{slug}/reviews/mine", headers=author, json=GOOD).json()["id"]
    client.patch(f"/api/admin/reviews/{rid}", headers=admin, json={"status": "published"})
    assert client.get("/api/me/notifications", headers=fan).json()["unread"] == 2
    assert all(x["kind"] != "review" for x in client.get("/api/me/notifications", headers=author).json()["items"])
    # unverified addresses get no email
    assert not any(m["To"] == "fan@example.com" and "Superb" in m["Subject"] for m in mailer.sent)
    assert client.post("/api/me/notifications/read", headers=fan).status_code == 204
    assert client.get("/api/me/notifications", headers=fan).json()["unread"] == 0
    assert client.patch("/api/me", headers=fan, json={"email_notifications": False}).json()["email_notifications"] is False
