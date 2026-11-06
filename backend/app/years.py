"""Which production years the catalogue accepts.

From 1990 to the current year plus one: new model years go on sale before the calendar year starts.
The current year comes from the calendar, so nothing has to change in the code when a new year begins.
A modification still in production has no end year; it is shown as «2021–досі».
"""

from datetime import date
from typing import Annotated

from pydantic import AfterValidator

MIN_YEAR = 1990


def this_year() -> int:
    from .config import get_settings  # local import: config must not depend on this module

    return get_settings().current_year or date.today().year


def max_year() -> int:
    return this_year() + 1


def year_problem(y: int) -> str | None:
    if y < MIN_YEAR:
        return f"Каталог охоплює авто з {MIN_YEAR} року"
    if y > max_year():
        return f"Рік {y} ще не настав: допустимо до {max_year()}"
    return None


def _check(y: int) -> int:
    if (p := year_problem(y)) is not None:
        raise ValueError(p)
    return y


Year = Annotated[int, AfterValidator(_check)]


def span(year_from: int | None, year_to: int | None, in_production: bool = False) -> str | None:
    if not year_from:
        return None
    return f"{year_from}–досі" if in_production else f"{year_from}–{year_to}"
