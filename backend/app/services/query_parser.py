"""Turns a natural-language request into catalogue filters.

Rule-based on purpose: every recognised token is shown back to the user, and
nothing outside the database is suggested. An LLM can replace this module later
behind the same function signature.
"""

import re
from typing import Any

from .scoring import PRESETS


def parse_query(text: str, usd_rate: float) -> dict[str, Any]:
    q = (text or "").lower().replace("’", "'").replace("ʼ", "'")
    f: dict[str, Any] = {}
    tags: list[str] = []

    m = re.search(r"(\d[\d\s.,]*)\s*(тис\.?|тисяч|k|к)?\s*(\$|дол|usd|у\.о|грн|€|євро)?", q)
    if m and re.search(r"до|бюджет|за|max|макс|\$|тис|дол|грн", q):
        n = float(m.group(1).replace(" ", "").replace(",", "."))
        if m.group(2) or n < 300:
            n *= 1000
        if m.group(3) and m.group(3).startswith("грн"):
            n /= usd_rate
        if n >= 1000:
            f["max_price"] = round(n)
            tags.append(f"бюджет до ${f['max_price']:,}".replace(",", " "))

    for pattern, value, tag in [
        (r"дизел", "diesel", "дизель"), (r"гібрид|hybrid", "hybrid", "гібрид"),
        (r"електр|\bev\b", "electric", "електро"), (r"бензин", "petrol", "бензин"),
    ]:
        if re.search(pattern, q):
            f["fuel"] = value
            tags.append(tag)
            break
    if re.search(r"механік|мкп|ручн", q):
        f["trans"] = "manual"
        tags.append("механіка")
    elif re.search(r"автомат|акп|робот|dsg|варіатор|cvt", q):
        f["trans"] = "automatic"
        tags.append("автоматична КПП")
    if re.search(r"повн|4x4|4х4|awd|4wd|позашлях", q):
        f["drive"] = "AWD"
        tags.append("повний привід")
    for pattern, value, tag in [
        (r"кросовер|позашляхов|suv|паркетник", "crossover", "кросовер"), (r"седан", "sedan", "седан"),
        (r"хетчбек|хечбек", "hatch", "хетчбек"), (r"ліфтбек", "liftback", "ліфтбек"), (r"універсал", "wagon", "універсал"),
    ]:
        if re.search(pattern, q):
            f["body"] = value
            tags.append(tag)
            break

    preset = None
    for pattern, key in [
        (r"сім'|сімей|діт", "family"), (r"міст|міськ", "city"), (r"трас|далек", "highway"),
        (r"динам|швидк|активн|спорт", "sport"), (r"економ|дешев|мало витрат|мінімальн", "budget"),
    ]:
        if re.search(pattern, q):
            preset = key
            tags.append("пріоритет: " + PRESETS[key]["name"].lower())
            break
    return {"filters": f, "preset": preset, "tags": tags}
