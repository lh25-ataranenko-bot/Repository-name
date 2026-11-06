"""Loads the demo catalogue and creates the first admin.

Usage: python -m app.seed.seed
Idempotent: existing modifications (by slug) are left untouched.
"""

import json
import os
from datetime import date
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import SessionLocal
from ..models import Brand, CarModel, Generation, Issue, Modification, User
from ..security import hash_password

DATA = Path(__file__).with_name("cars.json")
DIRECTORY = Path(__file__).with_name("models.json")


def get_or_create(db: Session, model, **kw):
    obj = db.scalar(select(model).filter_by(**kw))
    if obj is None:
        obj = model(**kw)
        db.add(obj)
        db.flush()
    return obj


def seed(db: Session, demo_catalogue: bool = True) -> int:
    added = 0
    for row in (json.loads(DATA.read_text(encoding="utf-8")) if demo_catalogue else []):
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

    seed_directory(db)
    s = get_settings()
    if not db.scalar(select(User).where(User.email == s.admin_email)):
        db.add(User(email=s.admin_email, name="Адміністратор", role="admin", email_verified=True,
                    password_hash=hash_password(s.admin_password)))
    db.commit()
    return added


def seed_directory(db: Session) -> int:
    """Brands and models since 1990 without modifications. Fills empty fields only, so an editor's
    corrections survive a later run. Returns how many models were added."""
    data = json.loads(DIRECTORY.read_text(encoding="utf-8"))
    brands = {}
    for b in data["brands"]:
        brand = get_or_create(db, Brand, name=b["name"])
        brand.country = brand.country or b["country"] or None
        brand.alias = brand.alias or b["alias"] or None
        brands[b["name"]] = brand
    existing = {(m.brand_id, m.name): m for m in db.scalars(select(CarModel))}
    added = 0
    for m in data["models"]:
        brand = brands[m["brand"]]
        model = existing.get((brand.id, m["name"]))
        if model is None:
            model = CarModel(brand_id=brand.id, name=m["name"])
            db.add(model)
            added += 1
        if model.year_from is None:  # never filled: take the directory record
            for k in ("alias", "year_from", "year_to", "body", "years_note", "wikidata"):
                setattr(model, k, m[k])
    db.flush()
    return added


if __name__ == "__main__":
    # AUTOWISE_SEED_DEMO=0 creates only the administrator (for a catalogue filled by import).
    demo = os.environ.get("AUTOWISE_SEED_DEMO", "1") != "0"
    with SessionLocal() as session:
        print(f"Додано модифікацій: {seed(session, demo)}")
