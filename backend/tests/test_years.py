"""Catalogue years: from 1990 to next year, the current year from the calendar, cars still in production."""

from datetime import date

import pytest
from pydantic import ValidationError

from app.schemas import CarCreate, CheckIn
from app.services.listing import vin_year
from app.years import MIN_YEAR, max_year, span, this_year


def test_current_year_comes_from_the_calendar():
    assert this_year() == date.today().year
    assert max_year() == this_year() + 1


def test_year_limits():
    base = dict(brand="X", model="Y", generation="I", name="1.0", body="hatch", fuel="petrol", trans_type="manual", drive="FWD")
    CarCreate(**base, year_from=MIN_YEAR, year_to=None)
    CarCreate(**base, year_from=max_year())  # next model year is already on sale
    with pytest.raises(ValidationError, match="з 1990"):
        CarCreate(**base, year_from=1989)
    with pytest.raises(ValidationError, match="ще не настав"):
        CarCreate(**base, year_from=max_year() + 1)
    with pytest.raises(ValidationError):
        CheckIn(slug="x", year=1985, km=1, price=1000)


def test_span():
    assert span(2021, None, True) == "2021–досі"
    assert span(2018, 2021) == "2018–2021"
    assert span(None, None) is None


def test_vin_year_repeats_every_30_years():
    assert vin_year("L", 1991) == 1990
    assert vin_year("L", 2019) == 2020
    assert vin_year("H", 2017) == 2017
    assert vin_year("Y", 2000) == 2000  # 2030 is not possible yet
    assert vin_year("I") is None


def test_car_in_production_reaches_the_current_year(client):
    cars = [c for off in range(0, 400, 48) for c in client.get(f"/api/cars?offset={off}").json()["items"]]
    car = next(c for c in cars if c["in_production"])
    detail = client.get(f"/api/cars/{car['slug']}").json()
    assert detail["year_to"] == this_year() and detail["years"][-1] == this_year()
    meta = client.get("/api/meta").json()
    assert (meta["current_year"], meta["year_min"], meta["year_max"]) == (this_year(), 1990, this_year() + 1)
    assert client.get(f"/api/cars/{car['slug']}?year=1989").status_code == 422


def test_import_understands_cars_still_in_production(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    csv = ("brand,model,generation,modification,years,fuel,hp,price\n"
           "Testa,Ongoing,I,1.0,2023–досі,petrol,100,15000\n"
           "Testa,Old,I,1.0,1985–1992,petrol,100,1500\n")
    rows = client.post("/api/admin/import/validate", json={"csv": csv}, headers=h).json()["rows"]
    assert rows[0]["data"]["year_from"] == 2023 and rows[0]["data"]["year_to"] is None and not rows[0]["errors"]
    assert any("1990" in e for e in rows[1]["errors"])
