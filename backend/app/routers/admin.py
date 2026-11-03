"""Admin panel API: data quality, import with validation, edits and reviews with a change log, roles."""

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Brand, CarModel, ChangeLog, Generation, Issue, Modification, User
from ..schemas import CarCreate, CarPatch, ImportIn, IssueIn, RoleIn
from ..security import require_admin, require_editor
from ..services import importer
from ..services.catalog import load_cars

router = APIRouter(prefix="/api/admin", tags=["admin"])

COMPLETENESS = ["hp", "torque", "acc", "vmax", "cons_pass", "cons_real", "trunk", "clearance", "ncap",
                "reliability", "maint_per_year", "repair_per_year", "depreciation", "price"]
CRITICAL = {"hp", "torque", "acc", "cons_pass", "cons_real", "price", "reliability", "fuel", "trans_type", "drive",
            "maint_per_year", "repair_per_year", "depreciation"}


def get_mod(db: Session, slug: str) -> Modification:
    m = db.scalar(select(Modification).where(Modification.slug == slug))
    if m is None:
        raise HTTPException(404, "Модифікацію не знайдено")
    return m


def log(db: Session, m: Modification | None, user: User, action: str, field: str | None = None,
        old: Any = None, new: Any = None) -> None:
    db.add(ChangeLog(modification_id=m.id if m else None, user_id=user.id, action=action, field=field,
                     old_value=None if old is None else str(old), new_value=None if new is None else str(new)))


def check_values(m: Modification) -> None:
    """Cross-field checks the schema ranges cannot express."""
    if m.year_from and m.year_to and m.year_from > m.year_to:
        raise HTTPException(422, "Рік початку випуску не може бути пізнішим за рік завершення")
    if m.fuel != "electric":
        for field in ("cons_pass", "cons_real"):
            v = getattr(m, field)
            if v is not None and v > 25:
                raise HTTPException(422, f"Витрата {v:g} л/100 км нереалістична. Можливо, це милі на галон (mpg) "
                                         "або помилка одиниць")


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


@router.post("/cars", status_code=201)
def create_car(body: CarCreate, db: Session = Depends(get_db), user: User = Depends(require_editor)) -> dict[str, str]:
    brand = importer._get_or_create(db, Brand, name=body.brand.strip())
    model = importer._get_or_create(db, CarModel, brand_id=brand.id, name=body.model.strip())
    gen = importer._get_or_create(db, Generation, model_id=model.id, name=body.generation.strip())
    slug = importer.slugify(brand.name, model.name, gen.name, body.name)
    if db.scalar(select(Modification.id).where(Modification.slug == slug)) or db.scalar(
            select(Modification.id).where(Modification.generation_id == gen.id, Modification.name == body.name)):
        raise HTTPException(409, "Така модифікація вже є в каталозі")
    fields = body.model_dump(exclude={"brand", "model", "generation"}, exclude_none=True)
    m = Modification(slug=slug, generation_id=gen.id, assists=fields.pop("assists", []), updated_at=date.today(),
                     status="unverified", **fields)
    check_values(m)
    db.add(m)
    db.flush()
    log(db, m, user, "create", new=slug)
    db.commit()
    return {"slug": slug}


@router.patch("/cars/{slug}")
def patch_car(slug: str, body: CarPatch, db: Session = Depends(get_db), user: User = Depends(require_editor)) -> dict[str, Any]:
    m = get_mod(db, slug)
    changes = body.model_dump(exclude_unset=True)
    critical_changed = False
    changed = []
    for field, new in changes.items():
        if field == "status":
            continue
        old = getattr(m, field)
        if old == new:
            continue
        setattr(m, field, new)
        log(db, m, user, "update", field, old, new)
        critical_changed |= field in CRITICAL
        changed.append(field)
    check_values(m)
    if "status" in changes and changes["status"] != m.status:
        log(db, m, user, "review" if changes["status"] == "verified" else "update", "status", m.status, changes["status"])
        m.status = changes["status"]
    elif critical_changed and m.status == "verified":
        # A critical value edited without an explicit review goes back to "partial".
        log(db, m, user, "update", "status", m.status, "partial")
        m.status = "partial"
    if changed or "status" in changes:
        m.updated_at = date.today()
    db.commit()
    return {"slug": m.slug, "status": m.status, "changed": changed}


@router.post("/cars/{slug}/review")
def review_car(slug: str, db: Session = Depends(get_db), user: User = Depends(require_editor)) -> dict[str, str]:
    """Editor confirms the values against the source."""
    m = get_mod(db, slug)
    if m.status != "verified":
        log(db, m, user, "review", "status", m.status, "verified")
        m.status = "verified"
        m.updated_at = date.today()
        db.commit()
    return {"slug": m.slug, "status": m.status}


@router.put("/cars/{slug}/issues")
def replace_issues(slug: str, body: list[IssueIn], db: Session = Depends(get_db), user: User = Depends(require_editor)) -> dict[str, Any]:
    m = get_mod(db, slug)
    if len(body) > 30:
        raise HTTPException(422, "Не більше 30 несправностей на модифікацію")
    old = "; ".join(f"{i.part} ({i.frequency}, {i.cost:g})" for i in m.issues)
    new = "; ".join(f"{i.part} ({i.frequency}, {i.cost:g})" for i in body)
    if old != new:
        m.issues = [Issue(**i.model_dump()) for i in body]
        log(db, m, user, "update", "issues", old, new)
        m.updated_at = date.today()
        db.commit()
    return {"slug": m.slug, "issues": len(body)}


@router.delete("/cars/{slug}", status_code=204)
def delete_car(slug: str, db: Session = Depends(get_db), user: User = Depends(require_admin)) -> Response:
    m = get_mod(db, slug)
    log(db, None, user, "delete", None, m.slug, None)
    db.delete(m)
    db.commit()
    return Response(status_code=204)


@router.get("/changelog")
def changelog(slug: str | None = None, db: Session = Depends(get_db), _: User = Depends(require_editor)) -> list[dict[str, Any]]:
    stmt = (
        select(ChangeLog, Modification.slug, User.email)
        .outerjoin(Modification, Modification.id == ChangeLog.modification_id)
        .outerjoin(User, User.id == ChangeLog.user_id)
        .order_by(ChangeLog.created_at.desc(), ChangeLog.id.desc()).limit(200)
    )
    if slug:
        stmt = stmt.where(Modification.slug == slug)
    return [{"id": c.id, "slug": s, "user": email, "action": c.action, "field": c.field,
             "old": c.old_value, "new": c.new_value, "at": c.created_at.isoformat()} for c, s, email in db.execute(stmt)]


@router.get("/users")
def users(db: Session = Depends(get_db), _: User = Depends(require_admin)) -> list[dict[str, Any]]:
    return [{"id": u.id, "email": u.email, "name": u.name, "role": u.role, "verified": u.email_verified,
             "created_at": u.created_at.isoformat()} for u in db.scalars(select(User).order_by(User.id))]


@router.patch("/users/{uid}")
def set_role(uid: int, body: RoleIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)) -> dict[str, Any]:
    u = db.get(User, uid)
    if u is None:
        raise HTTPException(404, "Користувача не знайдено")
    if u.id == admin.id and body.role != "admin":
        admins = db.scalar(select(func.count()).select_from(User).where(User.role == "admin"))
        if admins <= 1:
            raise HTTPException(409, "Не можна зняти права з останнього адміністратора")
    if u.role != body.role:
        log(db, None, admin, "role", u.email, u.role, body.role)
        u.role = body.role
        db.commit()
    return {"id": u.id, "role": u.role}
