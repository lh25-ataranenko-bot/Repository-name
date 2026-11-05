"""Anonymous popularity: views per modification per day, for "popular now" and the admin stats."""

from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import CarViewDay, Modification, User
from ..security import require_editor
from ..services.cache import Counter

router = APIRouter(prefix="/api", tags=["popular"])
seen = Counter("view-seen", 3600)  # the same visitor and page count once an hour


def client_ip(request: Request) -> str:
    ip = request.client.host if request.client else "unknown"
    fwd = request.headers.get("x-forwarded-for")
    return fwd.split(",")[0].strip() if get_settings().trust_forwarded_for and fwd else ip


@router.post("/cars/{slug}/view", status_code=204)
def count_view(slug: str, request: Request, db: Session = Depends(get_db)) -> Response:
    mid = db.scalar(select(Modification.id).where(Modification.slug == slug))
    if mid is None:
        raise HTTPException(404, "Модифікацію не знайдено")
    if seen.hit(f"{client_ip(request)}|{slug}") == 1:
        stmt = insert(CarViewDay).values(modification_id=mid, day=date.today(), views=1)
        db.execute(stmt.on_conflict_do_update(index_elements=["modification_id", "day"],
                                              set_={"views": CarViewDay.views + 1}))
        db.commit()
    return Response(status_code=204)


def top(db: Session, days: int, limit: int) -> list[dict[str, Any]]:
    since = date.today() - timedelta(days=days - 1)
    rows = db.execute(
        select(Modification.slug, func.sum(CarViewDay.views).label("views"))
        .join(CarViewDay, CarViewDay.modification_id == Modification.id)
        .where(CarViewDay.day >= since).group_by(Modification.slug)
        .order_by(func.sum(CarViewDay.views).desc(), Modification.slug).limit(limit))
    return [{"slug": s, "views": int(v)} for s, v in rows]


@router.get("/popular")
def popular(db: Session = Depends(get_db), days: int = Query(30, ge=1, le=365),
            limit: int = Query(8, ge=1, le=50)) -> list[dict[str, Any]]:
    return top(db, days, limit)


@router.get("/admin/popular")
def popular_stats(db: Session = Depends(get_db), _: User = Depends(require_editor),
                  days: int = Query(30, ge=1, le=365)) -> dict[str, Any]:
    since = date.today() - timedelta(days=days - 1)
    per_day = db.execute(select(CarViewDay.day, func.sum(CarViewDay.views)).where(CarViewDay.day >= since)
                         .group_by(CarViewDay.day).order_by(CarViewDay.day))
    return {"days": days, "top": top(db, days, 20),
            "per_day": [{"day": d.isoformat(), "views": int(v)} for d, v in per_day]}
