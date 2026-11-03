import re

from app.services import mailer


def last_link(path):
    body = mailer.sent[-1].get_content()
    return re.search(rf"{path}\?token=([\w-]+)", body).group(1)


def test_verify_email(client):
    r = client.post("/api/auth/register", json={"email": "v@example.com", "password": "secret123"})
    assert r.json()["user"]["email_verified"] is False
    token = last_link("/account/verify")
    assert client.post("/api/auth/verify", json={"token": token}).json()["email_verified"] is True
    assert client.post("/api/auth/verify", json={"token": token}).status_code == 400  # one-time


def test_forgot_and_reset_signs_out_other_devices(client):
    r = client.post("/api/auth/register", json={"email": "r@example.com", "password": "secret123"})
    old = {"Authorization": f"Bearer {r.json()['token']}"}
    n = len(mailer.sent)
    assert client.post("/api/auth/forgot", json={"email": "nobody@example.com"}).status_code == 204
    assert len(mailer.sent) == n  # unknown email: same answer, no letter
    assert client.post("/api/auth/forgot", json={"email": "R@example.com"}).status_code == 204
    token = last_link("/account/reset")
    assert client.post("/api/auth/reset", json={"token": token, "password": "short"}).status_code == 422
    r = client.post("/api/auth/reset", json={"token": token, "password": "newsecret1"})
    assert r.status_code == 200
    assert client.get("/api/me", headers=old).status_code == 401
    assert client.post("/api/auth/login", json={"email": "r@example.com", "password": "newsecret1"}).status_code == 200
    assert client.post("/api/auth/reset", json={"token": token, "password": "another123"}).status_code == 400


def test_change_password(client):
    r = client.post("/api/auth/register", json={"email": "c@example.com", "password": "secret123"})
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    assert client.post("/api/me/password", headers=h, json={"current": "wrong", "new": "newsecret1"}).status_code == 400
    r = client.post("/api/me/password", headers=h, json={"current": "secret123", "new": "newsecret1"})
    assert r.status_code == 200
    assert client.get("/api/me", headers=h).status_code == 401
    assert client.get("/api/me", headers={"Authorization": f"Bearer {r.json()['token']}"}).status_code == 200
    assert "пароль змінено" in mailer.sent[-1]["Subject"]


def test_login_lockout(client):
    client.post("/api/auth/register", json={"email": "l@example.com", "password": "secret123"})
    for _ in range(5):
        assert client.post("/api/auth/login", json={"email": "l@example.com", "password": "bad"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "l@example.com", "password": "secret123"}).status_code == 429


def test_profile_name(client):
    r = client.post("/api/auth/register", json={"email": "p@example.com", "password": "secret123"})
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    assert client.patch("/api/me", headers=h, json={"name": "Олена"}).json()["name"] == "Олена"
