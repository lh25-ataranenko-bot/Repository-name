from datetime import date, timedelta

from app.db import SessionLocal
from app.jobs.service_reminders import run
from app.models import Notification, User
from app.services import mailer


def _signup(client, email):
    r = client.post("/api/auth/register", json={"email": email, "password": "secret-pass-1", "name": "Т"})
    token = r.json()["token"]
    with SessionLocal() as db:
        u = db.query(User).filter_by(email=email).one()
        u.email_verified = True
        db.commit()
    return {"Authorization": f"Bearer {token}"}


def test_reminder_sent_once_per_stage_and_reset_by_service(client):
    h = _signup(client, "remind@example.com")
    g = client.post("/api/me/garage", json={"slug": "toyota-camry-xv70", "name": "Камрі", "start_km": 100000}, headers=h).json()
    client.patch(f"/api/me/garage/{g['id']}", json={"service_interval_km": 10000, "service_interval_months": 12}, headers=h)
    client.post(f"/api/me/garage/{g['id']}/entries", json={"date": date.today().isoformat(), "type": "fuel", "cost_uah": 2000, "km": 109500}, headers=h)

    mailer.sent.clear()
    with SessionLocal() as db:
        assert run(db) >= 1
        assert run(db) == 0  # the same stage is not repeated
    letters = [m for m in mailer.sent if m["To"] == "remind@example.com"]
    assert len(letters) == 1 and "Скоро ТО" in letters[0]["Subject"]

    client.post(f"/api/me/garage/{g['id']}/entries", json={"date": date.today().isoformat(), "type": "fuel", "cost_uah": 2000, "km": 110500}, headers=h)
    with SessionLocal() as db:
        run(db)  # overdue is a new stage
        texts = [n.text for n in db.query(Notification).join(User).filter(User.email == "remind@example.com", Notification.kind == "service")]
    assert any(t.startswith("Прострочене ТО") for t in texts) and len(texts) == 2

    # a service entry starts a new cycle: nothing is due right after it
    client.post(f"/api/me/garage/{g['id']}/entries", json={"date": date.today().isoformat(), "type": "service", "cost_uah": 5000, "km": 110600}, headers=h)
    with SessionLocal() as db:
        assert run(db, date.today()) == 0
        assert run(db, date.today() + timedelta(days=340)) >= 1  # date limit approaches
    notes = client.get("/api/me/notifications", headers=h).json()["items"]
    assert notes[0]["kind"] == "service"
