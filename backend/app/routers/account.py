"""Registration, login and the personal cabinet: favourites, saved comparisons, garage."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Favorite, GarageCar, GarageEntry, Modification, SavedComparison, User
from ..schemas import GarageCarIn, GarageEntryIn, LoginIn, RegisterIn, SavedIn, TokenOut, UserOut
from ..security import create_token, current_user, hash_password, verify_password

router = APIRouter(prefix="/api", tags=["account"])


def user_out(u: User) -> UserOut:
    return UserOut(id=u.id, email=u.email, name=u.name, role=u.role)


def mod_by_slug(db: Session, slug: str) -> Modification:
    m = db.scalar(select(Modification).where(Modification.slug == slug))
    if m is None:
        raise HTTPException(404, "Модифікацію не знайдено")
    return m


@router.post("/auth/register", response_model=TokenOut, status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db)) -> TokenOut:
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "Користувач із такою поштою вже існує")
    u = User(email=email, name=body.name, password_hash=hash_password(body.password))
    db.add(u)
    db.commit()
    return TokenOut(token=create_token(u), user=user_out(u))


@router.post("/auth/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)) -> TokenOut:
    u = db.scalar(select(User).where(User.email == body.email.lower()))
    if u is None or not verify_password(body.password, u.password_hash):
        raise HTTPException(401, "Неправильна пошта або пароль")
    return TokenOut(token=create_token(u), user=user_out(u))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)) -> UserOut:
    return user_out(user)


# ---- favourites
@router.get("/me/favorites")
def favorites(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[str]:
    return list(db.scalars(select(Modification.slug).join(Favorite, Favorite.modification_id == Modification.id)
                           .where(Favorite.user_id == user.id).order_by(Favorite.created_at)))


@router.put("/me/favorites/{slug}", status_code=204)
def add_favorite(slug: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Response:
    m = mod_by_slug(db, slug)
    if not db.get(Favorite, (user.id, m.id)):
        db.add(Favorite(user_id=user.id, modification_id=m.id))
        db.commit()
    return Response(status_code=204)


@router.delete("/me/favorites/{slug}", status_code=204)
def remove_favorite(slug: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Response:
    m = mod_by_slug(db, slug)
    fav = db.get(Favorite, (user.id, m.id))
    if fav:
        db.delete(fav)
        db.commit()
    return Response(status_code=204)


# ---- saved comparisons
@router.get("/me/comparisons")
def comparisons(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    rows = db.scalars(select(SavedComparison).where(SavedComparison.user_id == user.id)
                      .order_by(SavedComparison.created_at.desc()))
    return [{"id": r.id, "name": r.name, "slugs": r.slugs, "created_at": r.created_at.isoformat()} for r in rows]


@router.post("/me/comparisons", status_code=201)
def save_comparison(body: SavedIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    for s in body.slugs:
        mod_by_slug(db, s)
    r = SavedComparison(user_id=user.id, name=body.name, slugs=body.slugs)
    db.add(r)
    db.commit()
    return {"id": r.id}


@router.delete("/me/comparisons/{cid}", status_code=204)
def delete_comparison(cid: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Response:
    r = db.get(SavedComparison, cid)
    if r is None or r.user_id != user.id:
        raise HTTPException(404, "Порівняння не знайдено")
    db.delete(r)
    db.commit()
    return Response(status_code=204)


# ---- garage
def garage_out(g: GarageCar) -> dict[str, Any]:
    total = sum(e.cost_uah for e in g.entries)
    max_km = max([g.start_km, *[e.km for e in g.entries]])
    driven = max_km - g.start_km
    by_type: dict[str, float] = {}
    for e in g.entries:
        by_type[e.type] = by_type.get(e.type, 0) + e.cost_uah
    m = g.modification
    return {
        "id": g.id, "name": g.name, "start_km": g.start_km,
        "modification": {"slug": m.slug, "name": f"{m.brand_name} {m.model_name} {m.name}"} if m else None,
        "total_uah": total, "driven_km": driven, "current_km": max_km,
        "per_km_uah": total / driven if driven > 0 else None, "by_type": by_type,
        "entries": [{"id": e.id, "date": e.date.isoformat(), "type": e.type, "cost_uah": e.cost_uah,
                     "km": e.km, "note": e.note} for e in g.entries],
    }


def own_garage_car(db: Session, user: User, gid: int) -> GarageCar:
    g = db.get(GarageCar, gid)
    if g is None or g.user_id != user.id:
        raise HTTPException(404, "Авто в гаражі не знайдено")
    return g


@router.get("/me/garage")
def garage(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    return [garage_out(g) for g in db.scalars(select(GarageCar).where(GarageCar.user_id == user.id).order_by(GarageCar.id))]


@router.post("/me/garage", status_code=201)
def add_garage(body: GarageCarIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    mid = mod_by_slug(db, body.slug).id if body.slug else None
    g = GarageCar(user_id=user.id, modification_id=mid, name=body.name, start_km=body.start_km)
    db.add(g)
    db.commit()
    return garage_out(g)


@router.delete("/me/garage/{gid}", status_code=204)
def delete_garage(gid: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Response:
    db.delete(own_garage_car(db, user, gid))
    db.commit()
    return Response(status_code=204)


@router.post("/me/garage/{gid}/entries", status_code=201)
def add_entry(gid: int, body: GarageEntryIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    g = own_garage_car(db, user, gid)
    g.entries.append(GarageEntry(**body.model_dump()))
    db.commit()
    db.refresh(g)
    return garage_out(g)


@router.delete("/me/garage/{gid}/entries/{eid}", status_code=204)
def delete_entry(gid: int, eid: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Response:
    g = own_garage_car(db, user, gid)
    e = db.get(GarageEntry, eid)
    if e is None or e.garage_car_id != g.id:
        raise HTTPException(404, "Запис не знайдено")
    db.delete(e)
    db.commit()
    return Response(status_code=204)
