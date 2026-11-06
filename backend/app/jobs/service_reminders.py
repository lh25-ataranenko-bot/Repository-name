"""Daily service reminders for garage cars.

Usage: python -m app.jobs.service_reminders
Run it once a day (docker-compose.prod.yml has a «jobs» service for that). For every garage car whose
next service is within 1 000 km / 30 days, or already overdue, the owner gets one notice in the cabinet
and, if they keep email notices on, a letter. Each stage is sent once per service cycle: a new «ТО» entry
starts the next cycle. Running the job twice a day sends nothing new.
"""

import logging
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from ..config import get_settings
from ..db import SessionLocal
from ..models import GarageCar, Notification
from ..routers.account import service_due
from ..services import mailer

log = logging.getLogger("autowise.jobs")


def reminder_text(g: GarageCar, due: dict) -> str:
    when = []
    when.append(f"через {due['km_left']:,} км".replace(",", " ") if due["km_left"] > 0
                else f"пробіг {due['due_km']:,} км уже пройдено".replace(",", " "))
    d = date.fromisoformat(due["due_date"]).strftime("%d.%m.%Y")
    when.append(f"до {d}" if due["days_left"] > 0 else f"термін {d} минув")
    head = "Прострочене ТО" if due["status"] == "overdue" else "Скоро ТО"
    return f"{head}: «{g.name}» — {' або '.join(when)}"


def run(db: Session, today: date | None = None) -> int:
    """Sends due reminders; returns how many were sent. Commits."""
    today = today or date.today()
    s = get_settings()
    sent = 0
    cars = db.scalars(select(GarageCar).options(selectinload(GarageCar.entries), joinedload(GarageCar.user))).unique()
    for g in cars:
        current_km = max([g.start_km, *[e.km for e in g.entries]])
        due = service_due(g, current_km, today)
        if due["status"] == "ok":
            continue
        services = [e for e in g.entries if e.type == "service"]
        last = max(services, key=lambda e: (e.date, e.km)) if services else None
        key = f"{last.id if last else 0}:{due['status']}"
        if g.service_reminder_key == key:
            continue
        text = reminder_text(g, due)
        db.add(Notification(user_id=g.user_id, modification_id=g.modification_id, kind="service", text=text))
        g.service_reminder_key = key
        sent += 1
        u = g.user
        if u.email_verified and u.email_notifications:
            try:
                mailer.send(u.email, f"AutoWise: {text}",
                            f"{text}.\n\nГараж і записи про обслуговування: {s.app_url}/account#garage\n"
                            f"Після ТО додайте запис «ТО» — відлік почнеться заново.\n\n"
                            f"Вимкнути листи можна в кабінеті: {s.app_url}/account")
            except Exception:  # one failed letter must not stop the others
                log.warning("Не вдалося надіслати нагадування %s", u.email, exc_info=True)
    db.commit()
    return sent


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    with SessionLocal() as session:
        print(f"Нагадувань про ТО надіслано: {run(session)}")
