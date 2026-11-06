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
