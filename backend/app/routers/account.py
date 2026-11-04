"""Registration, login and the personal cabinet: favourites, saved comparisons, garage."""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..config import get_settings
from ..models import AuthToken, Favorite, GarageCar, GarageEntry, Modification, SavedComparison, User
from ..schemas import (ForgotIn, GarageCarIn, GarageEntryIn, LoginIn, PasswordChangeIn, ProfileIn, RegisterIn, ResetIn,
                       SavedIn, TokenIn, TokenOut, UserOut)
from ..security import create_token, current_user, hash_password, login_guard, verify_password
from ..services import mailer

router = APIRouter(prefix="/api", tags=["account"])


def user_out(u: User) -> UserOut:
    return UserOut(id=u.id, email=u.email, name=u.name, role=u.role, email_verified=u.email_verified)


def mod_by_slug(db: Session, slug: str) -> Modification:
    m = db.scalar(select(Modification).where(Modification.slug == slug))
    if m is None:
        raise HTTPException(404, "Модифікацію не знайдено")
    return m


TOKEN_TTL = {"verify": timedelta(days=3), "reset": timedelta(hours=1)}


def issue_token(db: Session, user: User, purpose: str) -> str:
    """Creates a one-time link token; older unused tokens of the same purpose stop working."""
    for t in db.scalars(select(AuthToken).where(AuthToken.user_id == user.id, AuthToken.purpose == purpose,
                                                AuthToken.used_at.is_(None))):
        t.used_at = datetime.now(UTC)
    raw = secrets.token_urlsafe(32)
    db.add(AuthToken(user_id=user.id, purpose=purpose, token_hash=hashlib.sha256(raw.encode()).hexdigest(),
                     expires_at=datetime.now(UTC) + TOKEN_TTL[purpose]))
    return raw


def consume_token(db: Session, raw: str, purpose: str) -> User:
    t = db.scalar(select(AuthToken).where(AuthToken.token_hash == hashlib.sha256(raw.encode()).hexdigest(),
                                          AuthToken.purpose == purpose))
    if t is None or t.used_at is not None or t.expires_at < datetime.now(UTC):
        raise HTTPException(400, "Посилання недійсне або застаріло. Запросіть новий лист.")
    t.used_at = datetime.now(UTC)
    return db.get(User, t.user_id)


def send_verification(db: Session, u: User) -> None:
    raw = issue_token(db, u, "verify")
    mailer.send(u.email, "AutoWise: підтвердіть пошту",
                f"Вітаємо{', ' + u.name if u.name else ''}!\n\nЩоб підтвердити пошту, відкрийте посилання:\n"
                f"{get_settings().app_url}/account/verify?token={raw}\n\nПосилання діє 3 дні.")


@router.post("/auth/register", response_model=TokenOut, status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db)) -> TokenOut:
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "Користувач із такою поштою вже існує")
    u = User(email=email, name=body.name, password_hash=hash_password(body.password))
    db.add(u)
    db.flush()
    send_verification(db, u)
    db.commit()
    return TokenOut(token=create_token(u), user=user_out(u))


@router.post("/auth/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)) -> TokenOut:
    email = body.email.lower().strip()
    login_guard.check(email)
    u = db.scalar(select(User).where(User.email == email))
    if u is None or not verify_password(body.password, u.password_hash):
        login_guard.failed(email)
        raise HTTPException(401, "Неправильна пошта або пароль")
    login_guard.succeeded(email)
    return TokenOut(token=create_token(u), user=user_out(u))


@router.post("/auth/verify", response_model=UserOut)
def verify_email(body: TokenIn, db: Session = Depends(get_db)) -> UserOut:
    u = consume_token(db, body.token, "verify")
    u.email_verified = True
    db.commit()
    return user_out(u)


@router.post("/auth/resend-verification", status_code=204)
def resend_verification(user: User = Depends(current_user), db: Session = Depends(get_db)) -> Response:
    if not user.email_verified:
        send_verification(db, user)
        db.commit()
    return Response(status_code=204)


@router.post("/auth/forgot", status_code=204)
def forgot_password(body: ForgotIn, db: Session = Depends(get_db)) -> Response:
    """Always 204, so the form does not reveal which emails are registered."""
    u = db.scalar(select(User).where(User.email == body.email.lower().strip()))
    if u is not None:
        raw = issue_token(db, u, "reset")
        mailer.send(u.email, "AutoWise: відновлення пароля",
                    "Хтось запросив відновлення пароля для вашого облікового запису AutoWise.\n\n"
                    f"Щоб задати новий пароль, відкрийте посилання:\n{get_settings().app_url}/account/reset?token={raw}\n\n"
                    "Посилання діє 1 годину. Якщо це були не ви, просто проігноруйте лист.")
        db.commit()
    return Response(status_code=204)


@router.post("/auth/reset", response_model=TokenOut)
def reset_password(body: ResetIn, db: Session = Depends(get_db)) -> TokenOut:
    u = consume_token(db, body.token, "reset")
    u.password_hash = hash_password(body.password)
    u.token_version += 1  # signs out every other device
    u.email_verified = True  # the link proved access to the mailbox
    login_guard.succeeded(u.email)
    db.commit()
    return TokenOut(token=create_token(u), user=user_out(u))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)) -> UserOut:
    return user_out(user)


@router.patch("/me", response_model=UserOut)
def update_me(body: ProfileIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> UserOut:
    user.name = body.name
    db.commit()
    return user_out(user)


@router.post("/me/password", response_model=TokenOut)
def change_password(body: PasswordChangeIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> TokenOut:
    if not verify_password(body.current, user.password_hash):
        raise HTTPException(400, "Поточний пароль неправильний")
    if body.current == body.new:
        raise HTTPException(400, "Новий пароль має відрізнятися від поточного")
    user.password_hash = hash_password(body.new)
    user.token_version += 1
    db.commit()
    mailer.send(user.email, "AutoWise: пароль змінено",
                "Пароль вашого облікового запису AutoWise щойно змінено. Інші пристрої вийшли з облікового запису.\n\n"
                f"Якщо це були не ви, відновіть пароль: {get_settings().app_url}/account/forgot")
    return TokenOut(token=create_token(user), user=user_out(user))


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
    if body.client_id and any(e.client_id == body.client_id for e in g.entries):
        return garage_out(g)  # already saved: a retry from the offline queue
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
