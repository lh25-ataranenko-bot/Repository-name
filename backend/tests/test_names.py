"""Typed brand and model search: Latin, Cyrillic, typos, keyboard layout, model codes."""

import pytest

CASES = [
    ("камри", "Toyota Camry"), ("Камрі", "Toyota Camry"), ("camry", "Toyota Camry"),
    ("тойота камри", "Toyota Camry"), ("камри тойота", "Toyota Camry"), ("сфькн", "Toyota Camry"),
    ("фольксваген пасат", "Volkswagen Passat"), ("шкода октавия", "Skoda Octavia"), ("octvia", "Skoda Octavia"),
    ("хендай туксон", "Hyundai Tucson"), ("бмв х5", "BMW X5"), ("мазда сх5", "Mazda CX-5"), ("ауди ку7", "Audi Q7"),
    ("крузак", "Toyota Land Cruiser"), ("таврія", "ZAZ Таврія"), ("tavria", "ZAZ Таврія"), ("кашкай", "Nissan Qashqai"),
]


@pytest.mark.parametrize("q,expected", CASES)
def test_first_suggestion(client, q, expected):
    r = client.get("/api/suggest", params={"q": q}).json()
    assert r and r[0]["label"] == expected, (q, [x["label"] for x in r][:3])


def test_brands_and_brand_filter(client):
    assert client.get("/api/suggest", params={"q": "мерс"}).json()[0] == {**client.get("/api/suggest", params={"q": "мерс"}).json()[0], "type": "brand", "brand": "Mercedes-Benz"}
    assert client.get("/api/suggest", params={"q": "ваз"}).json()[0]["brand"] == "Lada"
    models = client.get("/api/suggest", params={"brand": "Toyota", "q": "кр"}).json()
    assert models and all(m["brand"] == "Toyota" and m["type"] == "model" for m in models)
    everything = client.get("/api/suggest", params={"brand": "Toyota"}).json()
    assert len(everything) > 40


PARSE = [
    ("тойота камри до 20 тисяч", {"brand": "Toyota", "model": "Camry", "max_price": 20000}),
    ("бмв х5 дизель", {"brand": "BMW", "model": "X5", "fuel": "diesel"}),
    ("мазда 6 до 15 тисяч", {"brand": "Mazda", "model": "6", "max_price": 15000}),
    ("кіа до 10 тис", {"brand": "Kia", "max_price": 10000}),
    ("кросовер до 25 тис $ з автоматом для сім'ї", {"max_price": 25000, "trans": "automatic", "body": "crossover"}),
]


@pytest.mark.parametrize("q,expected", PARSE)
def test_smart_search_names(client, q, expected):
    assert client.post("/api/search/parse", json={"q": q}).json()["filters"] == expected


def test_catalog_search_and_picker_understand_cyrillic(client):
    found = client.get("/api/cars", params={"q": "октавія", "limit": 50}).json()["items"]
    assert found and all(c["model"] == "Octavia" for c in found)
    picks = client.get("/api/cars/lookup", params={"q": "камри"}).json()
    assert picks and all(p["model"].startswith("Camry") for p in picks)
