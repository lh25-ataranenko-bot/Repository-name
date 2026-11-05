"""Car photos: editors upload with author and licence; everyone sees them with the attribution."""

from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import CarPhoto, ChangeLog, Modification, User
from ..security import require_editor
from ..services import photos
from ..services.cache import catalog_cache

router = APIRouter(prefix="/api", tags=["photos"])


def photo_out(p: CarPhoto) -> dict[str, Any]:
    return {"id": p.id, "url": f"/api/media/photos/{p.filename}", "width": p.width, "height": p.height,
            "author": p.author, "license": p.license, "license_label": photos.LICENSES.get(p.license, p.license),
            "source_url": p.source_url, "is_primary": p.is_primary}


def mod_by_slug(db: Session, slug: str) -> Modification:
    m = db.scalar(select(Modification).where(Modification.slug == slug))
    if m is None:
        raise HTTPException(404, "Модифікацію не знайдено")
    return m


@router.get("/cars/{slug}/photos")
def list_photos(slug: str, db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    m = mod_by_slug(db, slug)
    rows = db.scalars(select(CarPhoto).where(CarPhoto.modification_id == m.id)
                      .order_by(CarPhoto.is_primary.desc(), CarPhoto.id))
    return [photo_out(p) for p in rows]


@router.post("/admin/cars/{slug}/photos", status_code=201)
async def upload_photo(slug: str, file: UploadFile = File(...), author: str = Form(..., min_length=2, max_length=120),
                       license: str = Form(...), source_url: str | None = Form(None, max_length=500),
                       db: Session = Depends(get_db), user: User = Depends(require_editor)) -> dict[str, Any]:
    if license not in photos.LICENSES:
        raise HTTPException(422, "Оберіть ліцензію зі списку")
    if license in ("cc-by-4.0", "cc-by-sa-4.0", "cc0") and not (source_url or "").startswith(("http://", "https://")):
        raise HTTPException(422, "Для фото з відкритою ліцензією вкажіть посилання на джерело")
    m = mod_by_slug(db, slug)
    data = await file.read(photos.MAX_BYTES + 1)
    try:
        name, w, h = photos.process(data)
    except ValueError as e:
        raise HTTPException(422, str(e)) from None
    first = db.scalar(select(CarPhoto.id).where(CarPhoto.modification_id == m.id)) is None
    p = CarPhoto(modification_id=m.id, filename=name, width=w, height=h, author=author.strip(), license=license,
                 source_url=source_url or None, is_primary=first)
    db.add(p)
    db.add(ChangeLog(modification_id=m.id, user_id=user.id, action="update", field="photo", new_value=f"{author} · {license}"))
    db.commit()
    catalog_cache.bump()
    return photo_out(p)


@router.post("/admin/photos/{pid}/primary")
def make_primary(pid: int, db: Session = Depends(get_db), _: User = Depends(require_editor)) -> dict[str, Any]:
    p = db.get(CarPhoto, pid)
    if p is None:
        raise HTTPException(404, "Фото не знайдено")
    for other in db.scalars(select(CarPhoto).where(CarPhoto.modification_id == p.modification_id)):
        other.is_primary = other.id == p.id
    db.commit()
    catalog_cache.bump()
    return photo_out(p)


@router.delete("/admin/photos/{pid}", status_code=204)
def delete_photo(pid: int, db: Session = Depends(get_db), user: User = Depends(require_editor)) -> Response:
    p = db.get(CarPhoto, pid)
    if p is None:
        raise HTTPException(404, "Фото не знайдено")
    mid, was_primary, name = p.modification_id, p.is_primary, p.filename
    db.add(ChangeLog(modification_id=mid, user_id=user.id, action="update", field="photo", old_value=f"{p.author} · {p.license}"))
    db.delete(p)
    db.flush()
    if was_primary:  # promote the next photo
        nxt = db.scalar(select(CarPhoto).where(CarPhoto.modification_id == mid).order_by(CarPhoto.id))
        if nxt:
            nxt.is_primary = True
    db.commit()
    photos.delete_file(name)
    catalog_cache.bump()
    return Response(status_code=204)
