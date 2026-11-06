"""Running-cost estimates for modifications without maintenance and repair data.

Many catalogue entries have only the basic specs. Without yearly maintenance and repair costs the cost of
ownership cannot be calculated. For those cars the costs are estimated from the cars that do have the data:
for each fuel type, cost = a × price^b, fitted on log values (cheaper cars cost less to run, but not
proportionally less). The fit is redone on every catalogue load, so it improves as real data is added.

The estimate is used only within the price range it was fitted on (up to 1.5× the dearest fitted car):
it says nothing reliable about a $300 000 supercar. Estimated fields are listed in car["estimated"],
shown as «оцінка за класом» and can be replaced with the user's own figures in the calculator.
"""

import math
import statistics
from typing import Any

FIELDS = ("maint_per_year", "repair_per_year")
MIN_SAMPLES = 8


def fit(cars: list[dict[str, Any]]) -> dict[tuple[str, str], dict[str, float]]:
    model: dict[tuple[str, str], dict[str, float]] = {}
    for field in FIELDS:
        for fuel in {c["fuel"] for c in cars}:
            pts = [(math.log(c["price"]), math.log(c[field])) for c in cars
                   if c["fuel"] == fuel and c.get("price") and c.get(field) and "estimated" not in c]
            if len(pts) < MIN_SAMPLES:
                continue
            xs, ys = zip(*pts)
            mx, my = statistics.fmean(xs), statistics.fmean(ys)
            sxx = sum((x - mx) ** 2 for x in xs)
            if sxx == 0:
                continue
            b = sum((x - mx) * (y - my) for x, y in pts) / sxx
            model[(field, fuel)] = {"a": my - b * mx, "b": b, "lo": math.exp(min(xs)) * 0.8, "hi": math.exp(max(xs)) * 1.5}
    return model


def apply(cars: list[dict[str, Any]], model: dict[tuple[str, str], dict[str, float]]) -> int:
    """Fills missing running costs in place; returns how many cars got an estimate."""
    n = 0
    for c in cars:
        price = c.get("price")
        done = []
        for field in FIELDS:
            m = model.get((field, c["fuel"]))
            if c.get(field) is None and price and m and m["lo"] <= price <= m["hi"]:
                c[field] = round(math.exp(m["a"]) * price ** m["b"] / 10) * 10
                done.append(field)
        if done:
            c["estimated"] = done
            n += 1
    return n


def estimate_running_costs(cars: list[dict[str, Any]]) -> int:
    return apply(cars, fit(cars))
