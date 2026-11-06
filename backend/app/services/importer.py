"""CSV/XLSX-style import with validation.

Imported rows land with status "unverified" and never overwrite an existing
modification: critical values must be reviewed before publishing.
"""

import csv
import io
import re
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Brand, CarModel, ChangeLog, Generation, Modification
from ..years import max_year, this_year, year_problem
from .catalog import BODY, DRIVE, FUEL, TRANS

REQUIRED = ["brand", "model", "generation", "modification", "fuel"]
RANGES = {
    "hp": (30, 1500, "потужність"), "torque": (50, 1500, "момент"), "acc": (2, 30, "розгін 0–100"),
    "cons": (1, 25, "витрата"), "price": (500, 500000, "ціна"),
}


def slugify(*parts: str) -> str:
    s = "-".join(parts).lower()
    return re.sub(r"[^a-z0-9а-яіїєґ]+", "-", s).strip("-")[:160]


def _existing_keys(db: Session) -> set[tuple[str, str, str, str]]:
    rows = db.execute(
        select(Brand.name, CarModel.name, Generation.name, Modification.name)
        .join(CarModel, CarModel.brand_id == Brand.id)
        .join(Generation, Generation.model_id == CarModel.id)
        .join(Modification, Modification.generation_id == Generation.id)
    )
    return {tuple(x.lower() for x in r) for r in rows}


def parse_csv(text: str) -> tuple[list[str], list[dict[str, str]]]:
    lines = [ln for ln in (text or "").strip().splitlines() if ln.strip()]
    if not lines:
        return [], []
    sep = ";" if ";" in lines[0] else ","
    reader = csv.DictReader(io.StringIO("\n".join(lines)), delimiter=sep)
    return list(reader.fieldnames or []), list(reader)


def parse_xlsx(data: bytes) -> tuple[list[str], list[dict[str, str]]]:
    """First worksheet; the first non-empty row is the header."""
    from openpyxl import load_workbook

    try:
        wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    except Exception as e:  # corrupt or not an xlsx
        raise ValueError("Не вдалося прочитати файл. Збережіть його у форматі Excel (.xlsx).") from e
    ws = wb.worksheets[0]
    rows = [[("" if v is None else (f"{v:g}" if isinstance(v, float) else str(v))).strip() for v in r]
            for r in ws.iter_rows(values_only=True)]
    wb.close()
    rows = [r for r in rows if any(r)]
    if not rows:
        return [], []
    header = rows[0]
    return header, [dict(zip(header, r)) for r in rows[1:]]


def validate(text: str, db: Session) -> dict[str, Any]:
    return validate_rows(*parse_csv(text), db)


def validate_rows(fieldnames: list[str], records: list[dict[str, str]], db: Session) -> dict[str, Any]:
    if not records:
        return {"fatal": "Потрібен рядок заголовків і хоча б один рядок даних.", "rows": []}
    header = [h.strip().lower() for h in fieldnames]
    missing = [r for r in REQUIRED if r not in header]
    if missing:
        return {"fatal": "Немає обов’язкових колонок: " + ", ".join(missing), "rows": []}

    existing = _existing_keys(db)
    seen: set[tuple[str, str, str, str]] = set()
    rows = []
    for i, raw in enumerate(records, start=2):
        o = {k.strip().lower(): (v or "").strip() for k, v in raw.items() if k}
        errs: list[str] = []
        warns: list[str] = []
        for r in REQUIRED:
            if not o.get(r):
                errs.append(f"порожнє поле {r}")
        if o.get("fuel") and o["fuel"] not in FUEL:
            errs.append(f"невідоме паливо «{o['fuel']}»")
        nums: dict[str, float | None] = {}
        for key, (lo, hi, label) in RANGES.items():
            val = o.get(key, "")
            if val == "":
                warns.append(f"{label}: немає даних")
                nums[key] = None
                continue
            try:
                v = float(val.replace(",", "."))
            except ValueError:
                errs.append(f"{label}: не число")
                nums[key] = None
                continue
            if not lo <= v <= hi:
                hint = ""
                if key == "cons" and o.get("fuel") != "electric":
                    hint = ". Схоже на милі на галон (mpg) або помилку одиниць, очікується л/100 км"
                errs.append(f"{label} = {v:g} поза межами {lo}–{hi}{hint}")
                nums[key] = None
            else:
                nums[key] = v
        key4 = tuple(o.get(k, "").lower() for k in ("brand", "model", "generation", "modification"))
        if key4 in existing:
            errs.append("дублікат: така модифікація вже є в каталозі")
        elif key4 in seen:
            errs.append("дублікат усередині файлу")
        seen.add(key4)
        # "2018–2021", "2021" or, for a car still in production, "2021–досі" / "2021–"
        years_txt = o.get("years", "")
        years = [int(y) for y in re.findall(r"\d{4}", years_txt)]
        ongoing = len(years) == 1 and bool(re.search(r"[–-]\s*(досі|н\.?\s*в\.?|now|present)?\s*$", years_txt, re.I))
        for y in years:
            if (p := year_problem(y)) is not None:
                errs.append(f"роки випуску: {p}")
        if len(years) > 1 and years[0] > years[-1]:
            errs.append("роки випуску: рік початку пізніший за рік завершення")
        rows.append({
            "line": i, "errors": errs, "warnings": warns,
            "label": f"{o.get('brand', '')} {o.get('model', '')} {o.get('modification', '')}".strip(),
            "data": {
                "brand": o.get("brand"), "model": o.get("model"), "generation": o.get("generation"),
                "name": o.get("modification"), "fuel": o.get("fuel"),
                "year_from": years[0] if years else None, "year_to": None if ongoing or not years else years[-1],
                "year_ref": (max(years[0], min(this_year(), max_year())) if ongoing else years[-1]) if years else None,
                "body": o.get("body") if o.get("body") in BODY else "sedan",
                "trans_type": o.get("transmission") if o.get("transmission") in TRANS else "auto",
                "transmission": TRANS.get(o.get("transmission", ""), o.get("transmission") or None),
                "drive": o.get("drive") if o.get("drive") in DRIVE else "FWD",
                "hp": int(nums["hp"]) if nums["hp"] else None, "torque": int(nums["torque"]) if nums["torque"] else None,
                "acc": nums["acc"], "cons_pass": nums["cons"], "price": nums["price"],
            },
        })
    return {"fatal": None, "rows": rows}


def _get_or_create(db: Session, model, **kw):
    obj = db.scalar(select(model).filter_by(**kw))
    if obj is None:
        obj = model(**kw)
        db.add(obj)
        db.flush()
    return obj


def apply(text: str, db: Session, user_id: int | None) -> int:
    return apply_report(validate(text, db), db, user_id)


def apply_report(report: dict[str, Any], db: Session, user_id: int | None) -> int:
    added = 0
    for row in report["rows"]:
        if row["errors"]:
            continue
        d = dict(row["data"])
        brand = _get_or_create(db, Brand, name=d.pop("brand"))
        model = _get_or_create(db, CarModel, brand_id=brand.id, name=d.pop("model"))
        gen = _get_or_create(db, Generation, model_id=model.id, name=d.pop("generation"))
        mod = Modification(
            slug=slugify(brand.name, model.name, gen.name, d["name"]), generation_id=gen.id, assists=[],
            source="Імпорт CSV", updated_at=date.today(), status="unverified", **d,
        )
        db.add(mod)
        db.flush()
        db.add(ChangeLog(modification_id=mod.id, user_id=user_id, action="import", new_value=mod.slug))
        added += 1
    db.commit()
    return added
