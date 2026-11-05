"""Cost formulas from the product spec.

TCO = P + F + M + R + I + O + C − S   (C — loan interest paid while owning the car)
F   = (D × C / 100) × Q
S   = P × (1 − d) ^ years

All money is USD; fuel and electricity prices come in UAH and are converted with `rate`.
Every function takes plain dicts so the formulas can be tested without a database.
"""

from dataclasses import asdict, dataclass, field
from typing import Any

from ..config import get_settings

Car = dict[str, Any]


@dataclass
class Env:
    petrol: float
    diesel: float
    kwh: float
    rate: float
    km: int
    years: int
    other: float

    @classmethod
    def default(cls) -> "Env":
        s = get_settings()
        return cls(s.petrol_uah, s.diesel_uah, s.kwh_uah, s.usd_rate, s.km_per_year, 5, s.other_per_year)


@dataclass
class Overrides:
    price: float | None = None
    cons: float | None = None
    maint: float | None = None
    repair: float | None = None
    ins: float | None = None
    dep_pct: float | None = None  # % per year


@dataclass
class Credit:
    down_payment_pct: float = 30.0
    rate_pct: float = 18.0  # annual
    term_months: int = 60


def loan(principal: float, c: Credit, months_owned: int) -> dict[str, float]:
    """Annuity loan. Interest counts only for the months the car is owned; selling it repays the rest."""
    r = c.rate_pct / 100 / 12
    n = c.term_months
    payment = principal / n if r == 0 else principal * r / (1 - (1 + r) ** -n)
    balance, interest_owned = principal, 0.0
    for _ in range(min(n, months_owned)):
        interest = balance * r
        interest_owned += interest
        balance -= payment - interest
    return {"principal": principal, "monthly_payment": payment, "interest_total": payment * n - principal,
            "interest_in_period": interest_owned, "balance_at_sale": max(0.0, balance)}


@dataclass
class TcoResult:
    P: float
    F: float
    M: float
    R: float
    I: float  # noqa: E741 — name from the spec
    O: float  # noqa: E741
    S: float
    depreciation: float
    total: float
    per_month: float
    per_km: float
    years: int
    km_per_year: int
    assumptions: dict[str, Any] = field(default_factory=dict)
    C: float = 0.0
    credit: dict[str, float] | None = None

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


def is_ev(car: Car) -> bool:
    return car.get("fuel") == "electric"


def consumption(car: Car) -> tuple[float, bool] | None:
    """Real consumption when known, otherwise passport, with a flag saying which one."""
    if car.get("cons_real") is not None:
        return car["cons_real"], True
    if car.get("cons_pass") is not None:
        return car["cons_pass"], False
    return None


def energy_price_uah(car: Car, env: Env) -> float:
    if car.get("fuel") == "diesel":
        return env.diesel
    if car.get("fuel") == "electric":
        return env.kwh
    return env.petrol


def cost_per_100km(car: Car, env: Env) -> float | None:
    c = consumption(car)
    return None if c is None else c[0] * energy_price_uah(car, env) / env.rate


def real_range_km(car: Car) -> float | None:
    c = consumption(car)
    cap = car.get("battery") if is_ev(car) else car.get("tank")
    return None if c is None or not cap else cap * 100 / c[0]


def default_inputs(car: Car) -> dict[str, float | None]:
    price = car.get("price")
    cons = consumption(car)
    return {
        "price": price,
        "cons": cons[0] if cons else None,
        "maint": car.get("maint_per_year"),
        "repair": car.get("repair_per_year"),
        "ins": round(price * 0.03) if price is not None else None,
        "dep_pct": round(car["depreciation"] * 100, 1) if car.get("depreciation") is not None else None,
    }


def tco(car: Car, env: Env, ov: Overrides | None = None, credit: Credit | None = None) -> TcoResult | None:
    """Returns None when an input is missing: we never invent a value."""
    d = default_inputs(car)
    if ov:
        d.update({k: v for k, v in asdict(ov).items() if v is not None})
    if any(d[k] is None for k in ("price", "cons", "maint", "repair", "ins", "dep_pct")):
        return None
    years, km = env.years, env.km
    distance = km * years
    q = energy_price_uah(car, env) / env.rate
    P = float(d["price"])
    F = distance * d["cons"] / 100 * q
    M = d["maint"] * years
    R = d["repair"] * years
    I = d["ins"] * years  # noqa: E741
    O = env.other * years  # noqa: E741
    S = P * (1 - d["dep_pct"] / 100) ** years
    ln = loan(P * (1 - credit.down_payment_pct / 100), credit, years * 12) if credit else None
    C = ln["interest_in_period"] if ln else 0.0
    total = P + F + M + R + I + O + C - S
    return TcoResult(
        P=P, F=F, M=M, R=R, I=I, O=O, S=S, depreciation=P - S, total=total, C=C, credit=ln,
        per_month=total / (years * 12), per_km=total / distance if distance else 0,
        years=years, km_per_year=km,
        assumptions={**d, "fuel_price_uah": energy_price_uah(car, env), "rate": env.rate,
                     "consumption_is_real": bool(consumption(car) and consumption(car)[1]) and (ov is None or ov.cons is None)},
    )


def price_for_year(car: Car, year: int | None) -> float | None:
    """Market price of a car of the given production year, from the reference price and yearly depreciation.

    price(year) = price × (1 − d) ^ (year_ref − year). None outside the production years or without data.
    """
    if year is None:
        return car.get("price")
    if car.get("price") is None or car.get("depreciation") is None or not car.get("year_ref"):
        return None
    if car.get("year_from") and not car["year_from"] <= year <= (car.get("year_to") or year):
        return None
    return round(car["price"] * (1 - car["depreciation"]) ** (car["year_ref"] - year), -1)
