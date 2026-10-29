"""Admin panel API: data quality, import with validation, edits with a change log."""

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import ChangeLog, Modification, User
from ..schemas import CarPatch, ImportIn
from ..security import require_editor
from ..services import importer
from ..services.catalog import load_cars

router = APIRouter(prefix="/api/admin", tags=["admin"])

COMPLETENESS = ["hp", "torque", "acc", "vmax", "cons_pass", "cons_real", "trunk", "clearance", "ncap",
                "reliability", "maint_per_year", "repair_per_year", "depreciation", "price"]
CRITICAL = {"hp", "torque", "acc", "cons_pass", "cons_real", "price", "reliability"}


@router.get("/quality")
def quality(db: Session = Depends(get_db), _: User = Depends(require_editor)) -> dict[str, Any]:
    cars = load_cars(db)
    items = []
    for c in cars:
        filled = sum(c[k] is not None for k in COMPLETENESS)
        items.append({"slug": c["slug"], "name": f"{c['brand']} {c['model']} {c['name']}", "generation": c["generation"],
                      "status": c["status"], "source": c["source"], "updated_at": c["updated_at"],
                      "completeness": round(filled / len(COMPLETENESS) * 100),
                      "missing": [k for k in COMPLETENESS if c[k] is None]})
    counts = {s: sum(1 for c in cars if c["status"] == s) for s in ("verified", "partial", "unverified")}
    return {"total": len(cars), "counts": counts, "items": items}


@router.post("/import/validate")
def import_validate(body: ImportIn, db: Session = Depends(get_db), _: User = Depends(require_editor)) -> dict[str, Any]:
    return importer.validate(body.csv, db)


@router.post("/import/apply")
def import_apply(body: ImportIn, db: Session = Depends(get_db), user: User = Depends(require_editor)) -> dict[str, int]:
    return {"added": importer.apply(body.csv, db, user.id)}


@router.patch("/cars/{slug}")
def patch_car(slug: str, body: CarPatch, db: Session = Depends(get_db), user: User = Depends(require_editor)) -> dict[str, Any]:
    m = db.scalar(select(Modification).where(Modification.slug == slug))
    if m is None:
        raise HTTPException(404, "Модифікацію не знайдено")
    changes = body.model_dump(exclude_unset=True)
    critical_changed = False
    for field, new in changes.items():
        old = getattr(m, field)
        if old == new:
            continue
        setattr(m, field, new)
        db.add(ChangeLog(modification_id=m.id, user_id=user.id, action="update", field=field,
                         old_value=None if old is None else str(old), new_value=None if new is None else str(new)))
        critical_changed |= field in CRITICAL
    # A critical value edited without an explicit review goes back to "partial".
    if critical_changed and "status" not in changes:
        m.status = "partial"
    m.updated_at = date.today()
    db.commit()
    return {"slug": m.slug, "status": m.status}


@router.get("/changelog")
def changelog(db: Session = Depends(get_db), _: User = Depends(require_editor)) -> list[dict[str, Any]]:
    rows = db.execute(
        select(ChangeLog, Modification.slug, User.email)
        .outerjoin(Modification, Modification.id == ChangeLog.modification_id)
        .outerjoin(User, User.id == ChangeLog.user_id)
        .order_by(ChangeLog.created_at.desc()).limit(200)
    )
    return [{"id": c.id, "slug": slug, "user": email, "action": c.action, "field": c.field,
             "old": c.old_value, "new": c.new_value, "at": c.created_at.isoformat()} for c, slug, email in rows]
