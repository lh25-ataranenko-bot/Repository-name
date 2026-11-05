"""Loads modifications as plain dicts and builds the comparison table."""

from collections.abc import Callable
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from ..models import CarModel, Generation, Modification
from .calc import Car, Env, cost_per_100km, real_range_km, tco
from .scoring import compute_scores

FUEL = {"petrol": "Бензин", "diesel": "Дизель", "hybrid": "Гібрид", "electric": "Електро"}
BODY = {"sedan": "Седан", "liftback": "Ліфтбек", "crossover": "Кросовер", "hatch": "Хетчбек", "wagon": "Універсал", "minivan": "Мінівен", "van": "Фургон", "pickup": "Пікап"}
DRIVE = {"FWD": "Передній", "RWD": "Задній", "AWD": "Повний"}
TRANS = {"auto": "Автомат (АКП)", "robot": "Робот (DSG/DCT)", "cvt": "Варіатор", "manual": "Механіка", "reducer": "Редуктор (електро)"}
ASSIST = {"AEB": "Автоматичне гальмування", "LKA": "Утримання смуги", "ACC": "Адаптивний круїз",
          "BSM": "Контроль сліпих зон", "RCTA": "Попередження при виїзді заднім ходом"}
STATUS = {"verified": "Перевірено", "partial": "Частково перевірено", "unverified": "Не перевірено"}

FIELDS = [c.key for c in Modification.__table__.columns if c.key not in ("id", "generation_id")]


def to_dict(m: Modification) -> Car:
    d = {k: getattr(m, k) for k in FIELDS}
    d["updated_at"] = m.updated_at.isoformat() if m.updated_at else None
    d["brand"], d["model"], d["generation"] = m.brand_name, m.model_name, m.generation_name
    d["issues"] = [{"part": i.part, "frequency": i.frequency, "cost": i.cost} for i in m.issues]
    d["assists"] = list(m.assists or [])
    return d


def load_cars(db: Session) -> list[Car]:
    stmt = (
        select(Modification)
        .options(
            joinedload(Modification.generation).joinedload(Generation.model).joinedload(CarModel.brand),
            selectinload(Modification.issues),
        )
        .order_by(Modification.slug)
    )
    return [to_dict(m) for m in db.scalars(stmt).unique()]


def with_scores(cars: list[Car], env: Env) -> list[Car]:
    scores = compute_scores(cars, env)
    for c in cars:
        c["scores"] = scores[c["slug"]]
        c["cost_per_100km"] = cost_per_100km(c, env)
        c["range_km"] = real_range_km(c)
        t = tco(c, Env(env.petrol, env.diesel, env.kwh, env.rate, 15000, 5, env.other))
        c["tco_5y"] = t.total if t else None
    return cars


def unit(c: Car) -> str:
    return "кВт·год/100 км" if c["fuel"] == "electric" else "л/100 км"


Row = tuple[str, Callable[[Car], Any], dict[str, Any]]
ROWS: list[tuple[str, list[Row]]] = [
    ("Ідентифікація", [
        ("Марка", lambda c: c["brand"], {}), ("Модель", lambda c: c["model"], {}),
        ("Покоління", lambda c: c["generation"], {}),
        ("Роки випуску", lambda c: f"{c['year_from']}–{c['year_to']}" if c["year_from"] else None, {}),
        ("Рік, для якого ціна", lambda c: c.get("for_year") or c.get("year_ref"), {}),
        ("Кузов", lambda c: BODY.get(c["body"]), {}),
    ]),
    ("Двигун і трансмісія", [
        ("Код двигуна", lambda c: c["engine_code"], {}), ("Паливо", lambda c: FUEL.get(c["fuel"]), {}),
        ("Об’єм, см³", lambda c: c["displacement"], {"num": 0}),
        ("Потужність, к.с.", lambda c: c["hp"], {"num": 0, "best": "max"}),
        ("Момент, Н·м", lambda c: c["torque"], {"num": 0, "best": "max"}),
        ("КПП", lambda c: c["transmission"], {}), ("Привід", lambda c: DRIVE.get(c["drive"]), {}),
    ]),
    ("Динаміка", [
        ("0–100 км/год, с", lambda c: c["acc"], {"num": 1, "best": "min"}),
        ("Макс. швидкість, км/год", lambda c: c["vmax"], {"num": 0, "best": "max"}),
    ]),
    ("Економічність", [
        ("Витрата (паспорт)", lambda c: c["cons_pass"], {"num": 1, "best": "min", "unit": unit}),
        ("Витрата (реальна)", lambda c: c["cons_real"], {"num": 1, "best": "min", "unit": unit}),
        ("Вартість 100 км, $", lambda c: c.get("cost_per_100km"), {"num": 2, "best": "min"}),
        ("Запас ходу (реальний), км", lambda c: c.get("range_km"), {"num": 0, "best": "max"}),
    ]),
    ("Габарити", [
        ("Довжина, мм", lambda c: c["length"], {"num": 0}),
        ("Колісна база, мм", lambda c: c["wheelbase"], {"num": 0, "best": "max"}),
        ("Кліренс, мм", lambda c: c["clearance"], {"num": 0, "best": "max"}),
        ("Багажник, л", lambda c: c["trunk"], {"num": 0, "best": "max"}),
    ]),
    ("Безпека і комфорт", [
        ("Euro NCAP, зірок", lambda c: c["ncap"],
         {"num": 0, "best": "max", "fmt": lambda c: f"{c['ncap']} ({c['ncap_year']})" if c["ncap"] is not None else None}),
        ("Подушки безпеки", lambda c: c["airbags"], {"num": 0, "best": "max"}),
        ("Асистенти", lambda c: len(c["assists"]) or None,
         {"num": 0, "best": "max", "fmt": lambda c: ", ".join(ASSIST.get(a, a) for a in c["assists"]) or None}),
        ("Індекс комфорту (0–10)", lambda c: c["comfort"], {"num": 1, "best": "max"}),
    ]),
    ("Експлуатація", [
        ("Надійність (0–100)", lambda c: c["reliability"],
         {"num": 0, "best": "max", "fmt": lambda c: f"{c['reliability']} · упевненість {c['reliability_confidence']}" if c["reliability"] is not None else None}),
        ("ТО на рік, $", lambda c: c["maint_per_year"], {"num": 0, "best": "min"}),
        ("Ремонти на рік (оцінка), $", lambda c: c["repair_per_year"], {"num": 0, "best": "min"}),
        ("Типові несправності", lambda c: "; ".join(i["part"] for i in c["issues"]) or None, {}),
    ]),
    ("Ринок", [
        ("Ціна, $", lambda c: c["price"], {"num": 0, "best": "min"}),
        ("Знецінення на рік, %", lambda c: c["depreciation"] * 100 if c["depreciation"] is not None else None, {"num": 1, "best": "min"}),
        ("Ліквідність", lambda c: c["liquidity"], {}),
        ("Володіння 5 років, $", lambda c: c.get("tco_5y"), {"num": 0, "best": "min"}),
    ]),
]


def fmt_num(v: float, digits: int) -> str:
    return f"{v:,.{digits}f}".replace(",", " ").replace(".", ",")


def comparison_table(cars: list[Car]) -> list[dict[str, Any]]:
    """Rows with display values and the indexes of the best value.
    Best is only marked when all cars share the same unit and values differ."""
    groups = []
    for group, rows in ROWS:
        out_rows = []
        for label, fn, o in rows:
            raw = [fn(c) for c in cars]
            display: list[str | None] = []
            for c, r in zip(cars, raw):
                if "fmt" in o:
                    display.append(o["fmt"](c))
                elif r is None:
                    display.append(None)
                elif "num" in o:
                    display.append(fmt_num(r, o["num"]) + (" " + o["unit"](c) if "unit" in o else ""))
                else:
                    display.append(str(r))
            best: list[int] = []
            if o.get("best"):
                units = {o["unit"](c) if "unit" in o else "" for c in cars}
                vals = [r for r in raw if r is not None]
                if len(units) == 1 and len(vals) > 1 and len(set(vals)) > 1:
                    target = max(vals) if o["best"] == "max" else min(vals)
                    best = [i for i, r in enumerate(raw) if r == target]
            out_rows.append({"label": label, "values": display, "best": best,
                             "same": len({str(d) for d in display}) == 1})
        groups.append({"group": group, "rows": out_rows})
    return groups
