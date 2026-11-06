"""Pre-purchase analysis: VIN sanity check, price vs. market, inspection checklist.

A VIN never proves the car's history. Without confirmed sources we do not claim
that a car had no accidents or that its mileage is genuine.
"""

import re
from typing import Any

from ..years import MIN_YEAR, max_year
from .calc import Car

WMI = {
    "WBA": "BMW (Німеччина)", "WBS": "BMW M (Німеччина)", "WVW": "Volkswagen (Німеччина)", "WV2": "Volkswagen (Німеччина)",
    "TMB": "Skoda (Чехія)", "JTM": "Toyota (Японія)", "JTN": "Toyota (Японія)", "JTD": "Toyota (Японія)", "4T1": "Toyota (США)",
    "SB1": "Toyota (Велика Британія)", "KMH": "Hyundai (Корея)", "TMA": "Hyundai (Чехія)", "KNA": "Kia (Корея)",
    "KNE": "Kia (Корея)", "U5Y": "Kia (Словаччина)", "SJN": "Nissan (Велика Британія)", "JN1": "Nissan (Японія)",
    "VF1": "Renault (Франція)", "UU1": "Dacia/Renault (Румунія)", "JMZ": "Mazda (Японія)", "5YJ": "Tesla (США)",
    "LRW": "Tesla (Китай)", "XP7": "Tesla (Німеччина)", "SHH": "Honda (Велика Британія)", "JHM": "Honda (Японія)",
    "2HK": "Honda (Канада)", "5J6": "Honda (США)",
    "WDD": "Mercedes-Benz (Німеччина)", "WDC": "Mercedes-Benz (Німеччина)", "W1K": "Mercedes-Benz (Німеччина)",
    "W1N": "Mercedes-Benz (Німеччина)", "WAU": "Audi (Німеччина)", "TRU": "Audi (Угорщина)", "WP0": "Porsche (Німеччина)",
    "WP1": "Porsche (Німеччина)", "VSS": "Seat/Cupra (Іспанія)", "ZFA": "Fiat (Італія)", "ZAR": "Alfa Romeo (Італія)",
    "TSM": "Suzuki (Угорщина)", "JSA": "Suzuki (Японія)", "SAL": "Land Rover (Велика Британія)",
    "SAJ": "Jaguar (Велика Британія)", "SAD": "Jaguar (Велика Британія)", "WMW": "Mini (Велика Британія)",
    "YV1": "Volvo (Швеція)", "YV4": "Volvo (Швеція)", "VF3": "Peugeot (Франція)", "VF7": "Citroen (Франція)",
    "W0L": "Opel (Німеччина)", "W0V": "Opel (Німеччина)", "WF0": "Ford (Німеччина)", "1FA": "Ford (США)",
    "1FM": "Ford (США)", "JF1": "Subaru (Японія)", "JF2": "Subaru (Японія)", "JMB": "Mitsubishi (Японія)",
    "JTH": "Lexus (Японія)", "JN8": "Nissan (Японія)", "VNK": "Toyota (Франція)", "KL1": "Chevrolet/Daewoo (Корея)",
    "Y6D": "ЗАЗ/Daewoo (Україна)", "LGX": "BYD (Китай)", "LSJ": "MG/SAIC (Китай)", "LVV": "Chery (Китай)",
    "L6T": "Geely (Китай)", "LGW": "Great Wall/Haval (Китай)",
}
# The 10th VIN character repeats every 30 years (A = 1980 and 2010, L = 1990 and 2020, ...).
VIN_YEAR_CODES = "ABCDEFGHJKLMNPRSTVWXY123456789"


def vin_year(code: str, claimed_year: int | None = None) -> int | None:
    """Model year for the 10th VIN character within 1990..next year; the one closest to the claimed year wins."""
    i = VIN_YEAR_CODES.find(code)
    if i < 0:
        return None
    options = [y for y in range(1980 + i, max_year() + 1, 30) if y >= MIN_YEAR]
    if not options:
        return None
    if claimed_year:
        return min(options, key=lambda y: abs(y - claimed_year))
    return options[-1]
CONDITION = {"excellent": 1.04, "good": 1.0, "needs": 0.88}


def decode_vin(vin: str, brand: str | None = None, claimed_year: int | None = None) -> dict[str, Any] | None:
    v = re.sub(r"\s", "", vin or "").upper()
    if not v:
        return None
    errors: list[str] = []
    notes: list[str] = []
    if len(v) != 17:
        errors.append(f"VIN має містити 17 символів, зараз {len(v)}.")
    if re.search(r"[IOQ]", v):
        errors.append("Літери I, O і Q у VIN не використовуються. Можливо, це 1 або 0.")
    if re.search(r"[^A-HJ-NPR-Z0-9]", re.sub(r"[IOQ]", "", v)):
        errors.append("VIN містить недопустимі символи.")
    maker = WMI.get(v[:3])
    year = vin_year(v[9], claimed_year) if len(v) >= 10 else None
    if not errors:
        if maker:
            notes.append(f"Виробник за кодом WMI {v[:3]}: {maker}")
            if brand and brand.lower() not in maker.lower() and not (brand == "Renault" and "Dacia" in maker):
                errors.append(f"VIN не відповідає марці {brand} з оголошення")
        else:
            notes.append(f"Код виробника {v[:3]} відсутній у довіднику")
        if year:
            notes.append(f"10-й символ «{v[9]}» — модельний рік {year}. У європейських авто цей символ не завжди означає рік.")
            if claimed_year and abs(year - claimed_year) > 1:
                errors.append(f"Рік за VIN ({year}) відрізняється від заявленого ({claimed_year})")
    return {"vin": v, "maker": maker, "model_year": year, "errors": errors, "notes": notes}


def market_value(car: Car, year: int, km: int, condition: str, current_year: int) -> dict[str, float] | None:
    if car.get("price") is None or car.get("depreciation") is None or not car.get("year_ref"):
        return None
    base = car["price"] * (1 - car["depreciation"]) ** (car["year_ref"] - year)
    expected = 15000 * max(0, current_year - year)
    adj = max(-0.15, min(0.10, -(km - expected) / 10000 * 0.006))
    value = base * (1 + adj) * CONDITION.get(condition, 1.0)
    return {"value": value, "low": value * 0.93, "high": value * 1.07, "expected_km": expected, "mileage_adj": adj}


def verdict(price: float, mv: dict[str, float]) -> dict[str, Any]:
    diff = (price - mv["value"]) / mv["value"] * 100
    if diff < -12:
        level, title, text = "bad", "Підозріло дешево", "Ціна значно нижча за аналоги. Перевірте історію ДТП, юридичну чистоту і стан ключових вузлів перед завдатком."
    elif diff < -5:
        level, title, text = "good", "Нижче ринку", "Вигідна пропозиція, якщо діагностика це підтвердить."
    elif diff > 12:
        level, title, text = "warn", "Значно вище ринку", "Є простір для торгу. Попросіть продавця пояснити ціну: свіже ТО, рідкісна комплектація, документи."
    elif diff > 5:
        level, title, text = "warn", "Трохи вище ринку", "Можна торгуватися, особливо за результатами діагностики."
    else:
        level, title, text = "good", "Ціна в ринку", "Ціна відповідає аналогам за роком, пробігом і станом."
    return {"level": level, "title": title, "text": text, "diff_pct": diff}


GENERAL = [
    "Звірити VIN на кузові, табличці й у техпаспорті",
    "Перевірити товщину ЛФП на всіх елементах кузова",
    "Холодний запуск: шуми, дим, вібрації",
    "Комп’ютерна діагностика всіх блоків, а не лише двигуна",
    "Перевірити геометрію кузова і зазори між панелями",
    "Тест-драйв: перемикання КПП, гальма, рульове, підвіска",
]
QUESTIONS = [
    "Скільки власників було і скільки авто у вас?",
    "Чи є сервісна історія і чеки на ТО?",
    "Які вузли замінювали і коли?",
    "Чи було авто в ДТП? Які елементи фарбувалися?",
    "Чи згодні на діагностику на СТО на мій вибір?",
]


def checklist(car: Car, km: int) -> dict[str, list[str]]:
    special: list[str] = []
    if car["fuel"] == "diesel":
        special.append("Перевірити стан DPF/EGR і наявність видалень у ПЗ")
    if car["trans_type"] == "robot":
        special.append("Адаптації та знос зчеплення DSG/DCT за діагностикою")
    if car["trans_type"] == "cvt":
        special.append("Історія заміни рідини варіатора, ривки при розгоні")
    if car["fuel"] == "electric":
        special.append("Звіт SOH батареї і кількість швидких заряджань")
    if car["drive"] == "AWD":
        special.append("Робота повного приводу: муфта, роздатка, шуми в поворотах")
    if km > 200000:
        special.append("Великий пробіг: оцініть ресурс турбіни, ГРМ і підвіски")
    issues = [f"{i['part']}" + (f" · ремонт ≈ ${i['cost']:,.0f}".replace(",", " ") if i["cost"] else "")
              for i in car.get("issues", [])]
    return {"general": GENERAL, "specific": special, "issues": issues, "questions": QUESTIONS}
