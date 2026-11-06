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
            assert c["tank"] and (c["cons_real"] or 0) <= 25 and (c["cons_pass"] or 0) <= 25, c["slug"]


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
