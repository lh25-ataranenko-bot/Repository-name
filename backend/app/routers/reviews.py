"""Owners' reviews: anyone reads published ones, signed-in users write, editors moderate."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from ..db import get_db
from ..models import Modification, Review, User
from ..schemas import ReviewIn, ReviewModerationIn
from ..security import current_user, require_editor
from ..services import notify
from ..services.cache import Counter
from ..years import span

router = APIRouter(prefix="/api", tags=["reviews"])
write_limit = Counter("review-write", 3600)
MAX_WRITES_PER_HOUR = 10


def mod_by_slug(db: Session, slug: str) -> Modification:
    m = db.scalar(select(Modification).where(Modification.slug == slug))
    if m is None:
        raise HTTPException(404, "Модифікацію не знайдено")
    return m


def public_out(r: Review) -> dict[str, Any]:
    name = (r.user.name or "").strip()
    return {"id": r.id, "author": name.split()[0] if name else "Власник", "rating": r.rating, "pros": r.pros, "cons": r.cons,
            "car_year": r.car_year, "owned_years": r.owned_years, "mileage_km": r.mileage_km,
            "created_at": r.created_at.isoformat()}


def summary(db: Session, modification_id: int) -> dict[str, Any]:
    rows = db.execute(select(Review.rating, func.count()).where(Review.modification_id == modification_id,
                                                                  Review.status == "published").group_by(Review.rating)).all()
    dist = {str(k): 0 for k in range(1, 6)}
    for rating, n in rows:
        dist[str(rating)] = n
    count = sum(dist.values())
    avg = round(sum(int(k) * v for k, v in dist.items()) / count, 1) if count else None
    return {"count": count, "average": avg, "distribution": dist}


@router.get("/cars/{slug}/reviews")
def list_reviews(slug: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    m = mod_by_slug(db, slug)
    items = db.scalars(select(Review).options(joinedload(Review.user))
                       .where(Review.modification_id == m.id, Review.status == "published")
                       .order_by(Review.created_at.desc()).limit(100))
    return {**summary(db, m.id), "items": [public_out(r) for r in items]}


@router.put("/cars/{slug}/reviews/mine")
def write_review(slug: str, body: ReviewIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    """Creates or edits the user's review of this modification; it then waits for moderation again."""
    if len(body.pros.strip()) + len(body.cons.strip()) < 20:
        raise HTTPException(422, "Опишіть плюси або мінуси хоча б кількома реченнями (від 20 символів разом)")
    if write_limit.hit(str(user.id)) > MAX_WRITES_PER_HOUR:
        raise HTTPException(429, "Забагато змін відгуків за годину. Спробуйте пізніше.")
    m = mod_by_slug(db, slug)
    if body.car_year and m.year_from and not m.year_from <= body.car_year <= (m.year_to or body.car_year):
        raise HTTPException(422, f"Ця модифікація випускалася в {span(m.year_from, m.year_to, m.year_to is None)} роках")
    r = db.scalar(select(Review).where(Review.user_id == user.id, Review.modification_id == m.id))
    if r is None:
        r = Review(user_id=user.id, modification_id=m.id)
        db.add(r)
    for k, v in body.model_dump().items():
        setattr(r, k, v.strip() if isinstance(v, str) else v)
    r.status, r.reject_reason = "pending", None
    db.commit()
    return {"id": r.id, "status": r.status}


@router.get("/me/reviews")
def my_reviews(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    rows = db.scalars(select(Review).options(joinedload(Review.user), joinedload(Review.modification))
                      .where(Review.user_id == user.id).order_by(Review.updated_at.desc()))
    return [{**public_out(r), "slug": r.modification.slug, "status": r.status, "reject_reason": r.reject_reason,
             "car": f"{r.modification.brand_name} {r.modification.model_name} {r.modification.name}"} for r in rows]


@router.delete("/me/reviews/{rid}", status_code=204)
def delete_my_review(rid: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Response:
    r = db.get(Review, rid)
    if r is None or r.user_id != user.id:
        raise HTTPException(404, "Відгук не знайдено")
    db.delete(r)
    db.commit()
    return Response(status_code=204)


@router.get("/admin/reviews")
def moderation_queue(status: str = "pending", db: Session = Depends(get_db), _: User = Depends(require_editor)) -> list[dict[str, Any]]:
    rows = db.scalars(select(Review).options(joinedload(Review.user), joinedload(Review.modification))
                      .where(Review.status == status).order_by(Review.updated_at).limit(200))
    return [{**public_out(r), "slug": r.modification.slug, "email": r.user.email, "status": r.status,
             "car": f"{r.modification.brand_name} {r.modification.model_name} {r.modification.name}"} for r in rows]


@router.patch("/admin/reviews/{rid}")
def moderate(rid: int, body: ReviewModerationIn, db: Session = Depends(get_db), _: User = Depends(require_editor)) -> dict[str, Any]:
    r = db.get(Review, rid)
    if r is None:
        raise HTTPException(404, "Відгук не знайдено")
    if body.status == "rejected" and not (body.reason or "").strip():
        raise HTTPException(422, "Вкажіть причину відхилення: її побачить автор")
    was_published = r.status == "published"
    r.status = body.status
    r.reject_reason = body.reason.strip() if body.status == "rejected" and body.reason else None
    if body.status == "published" and not was_published:
        m = r.modification
        notify.notify_favoriters(db, m, "review", f"Новий відгук про {m.brand_name} {m.model_name} {m.name}: {r.rating} з 5",
                                 exclude_user_id=r.user_id)
    db.commit()
    return {"id": r.id, "status": r.status}
