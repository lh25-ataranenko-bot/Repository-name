"""Customs clearance of a used car imported into Ukraine (approximate).

    customs value V = price + delivery to the border
    duty   = V × duty rate           (10 %; 0 % for EU-origin cars with an EUR.1 certificate)
    excise = petrol: €50 per 1000 cm³ (€100 above 3000 cm³)
             diesel: €75 per 1000 cm³ (€150 above 3500 cm³)
             × (cm³ / 1000) × age coefficient (full years since production − 1, from 1 to 15)
             hybrid: €100 per car; electric: €1 per kWh of battery capacity
    VAT    = 20 % × (V + duty + excise)
    pension fund fee at first registration: 3 / 4 / 5 % of the value, by thresholds of the
    subsistence minimum (165× and 290×).

Rates change: every one of them is a parameter with a default, shown to the user.
"""

from dataclasses import asdict, dataclass
from typing import Any


@dataclass
class CustomsRates:
    duty_pct: float = 10.0
    vat_pct: float = 20.0
    petrol_eur_per_l: float = 50.0
    petrol_big_eur_per_l: float = 100.0
    petrol_big_from_cc: int = 3000
    diesel_eur_per_l: float = 75.0
    diesel_big_eur_per_l: float = 150.0
    diesel_big_from_cc: int = 3500
    hybrid_eur: float = 100.0
    electric_eur_per_kwh: float = 1.0
    subsistence_minimum_uah: float = 3028.0  # used for the pension fund thresholds


def age_coefficient(production_year: int, current_year: int) -> int:
    return max(1, min(15, current_year - production_year - 1))


def excise_eur(fuel: str, cc: int | None, battery_kwh: float | None, production_year: int, current_year: int,
               r: CustomsRates) -> tuple[float, str]:
    """(excise in EUR, how it was computed)."""
    if fuel == "electric":
        kwh = battery_kwh or 0
        return kwh * r.electric_eur_per_kwh, f"{kwh:g} кВт·год × €{r.electric_eur_per_kwh:g}"
    if fuel == "hybrid":
        return r.hybrid_eur, f"фіксовано €{r.hybrid_eur:g} для гібрида"
    if not cc:
        raise ValueError("Вкажіть об’єм двигуна")
    if fuel == "diesel":
        base = r.diesel_big_eur_per_l if cc > r.diesel_big_from_cc else r.diesel_eur_per_l
    else:
        base = r.petrol_big_eur_per_l if cc > r.petrol_big_from_cc else r.petrol_eur_per_l
    k = age_coefficient(production_year, current_year)
    return base * cc / 1000 * k, f"€{base:g} × {cc / 1000:g} л × коефіцієнт віку {k}"


def pension_pct(value_uah: float, r: CustomsRates) -> float:
    if value_uah <= 165 * r.subsistence_minimum_uah:
        return 3.0
    if value_uah <= 290 * r.subsistence_minimum_uah:
        return 4.0
    return 5.0


def calculate(*, price: float, currency: str, delivery: float, production_year: int, fuel: str, cc: int | None,
              battery_kwh: float | None, eu_origin: bool, eur_uah: float, usd_uah: float, current_year: int,
              rates: CustomsRates | None = None, include_pension: bool = True) -> dict[str, Any]:
    r = rates or CustomsRates()
    to_uah = eur_uah if currency == "EUR" else usd_uah
    value_uah = (price + delivery) * to_uah
    duty_pct = 0.0 if eu_origin else r.duty_pct
    duty = value_uah * duty_pct / 100
    exc_eur, exc_how = excise_eur(fuel, cc, battery_kwh, production_year, current_year, r)
    excise = exc_eur * eur_uah
    vat = (value_uah + duty + excise) * r.vat_pct / 100
    customs_total = duty + excise + vat
    pf_pct = pension_pct(value_uah, r) if include_pension else 0.0
    pension = value_uah * pf_pct / 100
    total = value_uah + customs_total + pension

    def money(uah: float) -> dict[str, float]:
        return {"uah": round(uah), "usd": round(uah / usd_uah), "eur": round(uah / eur_uah)}

    return {
        "customs_value": money(value_uah),
        "lines": [
            {"key": "duty", "label": "Ввізне мито", "how": f"{duty_pct:g} % митної вартості" + (" (походження з ЄС, сертифікат EUR.1)" if eu_origin else ""), **money(duty)},
            {"key": "excise", "label": "Акцизний податок", "how": exc_how, **money(excise)},
            {"key": "vat", "label": "ПДВ", "how": f"{r.vat_pct:g} % від (вартість + мито + акциз)", **money(vat)},
            {"key": "pension", "label": "Збір до Пенсійного фонду", "how": f"{pf_pct:g} % вартості при першій реєстрації" if include_pension else "не враховано", **money(pension)},
        ],
        "customs_total": money(customs_total),
        "total": money(total),
        "age_coefficient": age_coefficient(production_year, current_year) if fuel in ("petrol", "diesel") else None,
        "rates": asdict(r),
    }
