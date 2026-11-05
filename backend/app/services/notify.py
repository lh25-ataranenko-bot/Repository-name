"""Notices to users who keep a modification in favourites."""

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Favorite, Modification, Notification, User
from . import mailer

log = logging.getLogger("autowise.notify")


def notify_favoriters(db: Session, m: Modification, kind: str, text: str, exclude_user_id: int | None = None) -> int:
    """Adds a notice for every user with this car in favourites; emails those who verified their address
    and keep email notices on. The caller commits. Returns how many users were notified."""
    users = db.scalars(select(User).join(Favorite, Favorite.user_id == User.id).where(Favorite.modification_id == m.id)).all()
    link = f"{get_settings().app_url}/cars/{m.slug}"
    n = 0
    for u in users:
        if u.id == exclude_user_id:
            continue
        db.add(Notification(user_id=u.id, modification_id=m.id, kind=kind, text=text))
        n += 1
        if u.email_verified and u.email_notifications:
            try:
                mailer.send(u.email, f"AutoWise: {text}", f"{text}\n\nСторінка авто: {link}\n\n"
                            f"Вимкнути листи можна в кабінеті: {get_settings().app_url}/account")
            except Exception:  # a mail failure must not break the editor's action
                log.warning("Не вдалося надіслати лист %s", u.email, exc_info=True)
    return n
