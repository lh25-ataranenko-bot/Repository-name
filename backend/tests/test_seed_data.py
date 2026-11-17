"""The demo catalogue must pass the same checks as an editor's input in the admin panel."""

import json

from app.schemas import CarCreate, IssueIn
from app.seed.seed import DATA
from app.years import MIN_YEAR, max_year

CARS = json.loads(DATA.read_text(encoding="utf-8"))


def test_every_row_passes_admin_validation():
    for row in CARS:
        fields = {k: v for k, v in row.items() if k not in ("slug", "issues", "status", "updated_at")}
        CarCreate(**fields)
        for i in row["issues"]:
            IssueIn(**i)


def test_unique_slugs_and_names():
    assert len({c["slug"] for c in CARS}) == len(CARS)
    assert len({(c["brand"], c["model"], c["generation"], c["name"]) for c in CARS}) == len(CARS)


def test_consistent_values():
    for c in CARS:
        # year_to empty = still in production
        assert MIN_YEAR <= c["year_from"] <= c["year_ref"] <= (c["year_to"] or max_year()), c["slug"]
        assert (c["ncap"] is None) == (c["ncap_year"] is None), c["slug"]
        if c["fuel"] == "electric":
            assert c["battery"] and c["tank"] is None and c["trans_type"] == "reducer", c["slug"]
        else:
            assert (c["tank"] is None or c["tank"] > 0) and (c["cons_real"] or 0) <= 25 and (c["cons_pass"] or 0) <= 25, c["slug"]


def test_directory_is_consistent():
    from app.schemas import Body
    from typing import get_args
    data = json.loads(DATA.with_name("models.json").read_text(encoding="utf-8"))
    names = [b["name"] for b in data["brands"]]
    assert len(names) == len(set(names))
    keys = [(m["brand"], m["name"]) for m in data["models"]]
    assert len(keys) == len(set(keys))
    for m in data["models"]:
        assert m["brand"] in names and m["body"] in get_args(Body), m
        assert m["year_to"] is None or (m["year_from"] <= m["year_to"] and m["year_to"] >= MIN_YEAR), m  # produced since 1990
        assert m["wikidata"] is None or m["wikidata"].startswith("Q"), m
    # every catalogue model is in the directory under the same name
    assert {(c["brand"], c["model"]) for c in CARS} <= set(keys)


def test_refresh_only_untouched_basic_demo_rows():
    from types import SimpleNamespace
    from app.seed.seed import refresh_demo_row

    def mod(**kw):
        return SimpleNamespace(id=kw.pop("id", 1), status="unverified", source="Довідник AutoWise: основні характеристики (не перевірено)",
                               reliability=None, issues=[], updated_at=None, **kw)
    newer = {"slug": "x", "brand": "B", "model": "M", "generation": "G", "reliability": 70, "status": "partial",
             "source": "Каталог виробника, Euro NCAP (демо)", "updated_at": "2026-11-06", "issues": []}
    m = mod()
    assert refresh_demo_row(m, newer, edited=set()) and m.reliability == 70 and m.status == "partial"
    assert not refresh_demo_row(mod(id=7), newer, edited={7})  # an editor changed it
    assert not refresh_demo_row(SimpleNamespace(id=2, status="verified", source="Довідник AutoWise"), newer, set())
    assert not refresh_demo_row(mod(), {**newer, "source": "Довідник AutoWise: основні"}, set())  # nothing newer


def test_prune_removes_only_untouched_unreferenced_demo_rows():
    """Dropped demo rows go; anything a user saved or an editor touched stays (the FKs cascade, so a blind
    delete would take favourites and reviews with it)."""
    from sqlalchemy import select
    from app.db import SessionLocal
    from app.models import Favorite, Modification, User
    from app.seed.seed import prune_demo_rows

    with SessionLocal() as db:
        free, liked, edited = db.scalars(select(Modification).limit(3)).all()
        for m in (free, liked, edited):  # make them look like untouched demo rows (rolled back at the end)
            m.status, m.source = "unverified", "Довідник AutoWise: основні характеристики (не перевірено)"
        admin = db.scalar(select(User))
        db.add(Favorite(user_id=admin.id, modification_id=liked.id))
        db.flush()
        keep = {m.slug for m in db.scalars(select(Modification))} - {free.slug, liked.slug, edited.slug}
        assert prune_demo_rows(db, keep, {edited.id}) == 1
        assert db.get(Modification, free.id) is None
        assert db.get(Modification, liked.id) is not None and db.get(Modification, edited.id) is not None
        db.rollback()
