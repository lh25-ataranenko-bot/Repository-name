"""Loads the demo catalogue and creates the first admin.

Usage: python -m app.seed.seed
Idempotent: existing modifications (by slug) are left untouched.
"""

import json
from datetime import date
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import SessionLocal
from ..models import Brand, CarModel, Generation, Issue, Modification, User
from ..security import hash_password

DATA = Path(__file__).with_name("cars.json")


def get_or_create(db: Session, model, **kw):
    obj = db.scalar(select(model).filter_by(**kw))
    if obj is None:
        obj = model(**kw)
        db.add(obj)
        db.flush()
    return obj


def seed(db: Session) -> int:
    added = 0
    for row in json.loads(DATA.read_text(encoding="utf-8")):
        if db.scalar(select(Modification.id).where(Modification.slug == row["slug"])):
            continue
        row = dict(row)
        issues = row.pop("issues")
        brand = get_or_create(db, Brand, name=row.pop("brand"))
        model = get_or_create(db, CarModel, brand_id=brand.id, name=row.pop("model"))
        gen = get_or_create(db, Generation, model_id=model.id, name=row.pop("generation"))
        row["updated_at"] = date.fromisoformat(row["updated_at"]) if row.get("updated_at") else None
        mod = Modification(generation_id=gen.id, **row)
        mod.issues = [Issue(**i) for i in issues]
        db.add(mod)
        added += 1

    s = get_settings()
    if not db.scalar(select(User).where(User.email == s.admin_email)):
        db.add(User(email=s.admin_email, name="Адміністратор", role="admin", password_hash=hash_password(s.admin_password)))
    db.commit()
    return added


if __name__ == "__main__":
    with SessionLocal() as session:
        print(f"Додано модифікацій: {seed(session)}")
