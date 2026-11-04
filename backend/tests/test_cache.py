import fakeredis
import pytest

from app.services import cache
from app.services.cache import CatalogCache, Counter


def test_edit_is_visible_immediately(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    before = client.get("/api/cars/kia-ceed-cd-16crdi").json()["price"]  # warms the cache
    client.patch("/api/admin/cars/kia-ceed-cd-16crdi", headers=h, json={"price": before + 1000})
    assert client.get("/api/cars/kia-ceed-cd-16crdi").json()["price"] == before + 1000
    assert client.get("/api/cars", params={"q": "ceed"}).json()["items"][0]["price"] == before + 1000


def test_get_car_does_not_leak_into_cache(client):
    client.get("/api/cars/toyota-corolla-e210-18hybrid")
    item = client.get("/api/cars", params={"q": "corolla"}).json()["items"][0]
    assert "tco_defaults" not in item


def test_pagination(client):
    first = client.get("/api/cars", params={"sort": "price", "limit": 10}).json()
    second = client.get("/api/cars", params={"sort": "price", "limit": 10, "offset": 10}).json()
    assert len(first["items"]) == 10 and first["count"] >= 40
    assert not {c["slug"] for c in first["items"]} & {c["slug"] for c in second["items"]}
    assert first["items"][-1]["price"] <= second["items"][0]["price"]


def test_lookup(client):
    r = client.get("/api/cars/lookup", params={"q": "bmw f30"}).json()
    assert {x["slug"] for x in r} == {"bmw-f30-320d-xdrive", "bmw-f30-320i"}
    assert set(r[0]) >= {"slug", "brand", "model", "name"} and "scores" not in r[0]


def test_rating_limit(client):
    r = client.post("/api/rating", json={"limit": 5, "filters": {"max_price": 40000}}).json()
    assert len(r["ranked"]) == 5 and r["matched"] > 5 and "reasons" in r["ranked"][0]


@pytest.fixture
def fake_redis():
    r = fakeredis.FakeRedis(decode_responses=True)
    cache.set_redis_client(r)
    yield r
    cache.set_redis_client(None)


def test_version_shared_through_redis(fake_redis, monkeypatch):
    monkeypatch.setattr(cache.get_settings(), "redis_url", "redis://fake")
    a, b = CatalogCache(), CatalogCache()  # two API instances
    builds = []
    assert b.get(("x",), lambda: builds.append(1) or "old") == "old"
    a.bump()  # an edit handled by instance A
    assert b.get(("x",), lambda: builds.append(1) or "new") == "new"
    assert len(builds) == 2


def test_counter_shared_through_redis(fake_redis, monkeypatch):
    monkeypatch.setattr(cache.get_settings(), "redis_url", "redis://fake")
    c1, c2 = Counter("t", 60), Counter("t", 60)
    c1.hit("1.2.3.4")
    assert c2.hit("1.2.3.4") == 2
    c2.reset("1.2.3.4")
    assert c1.count("1.2.3.4") == 0


def test_redis_down_falls_back_to_memory(monkeypatch):
    class Broken:
        def __getattr__(self, name):
            raise ConnectionError("down")
    cache.set_redis_client(Broken())
    monkeypatch.setattr(cache.get_settings(), "redis_url", "redis://down")
    try:
        c = Counter("t2", 60)
        assert c.hit("k") == 1 and c.hit("k") == 2
        cc = CatalogCache()
        assert cc.get(("y",), lambda: 5) == 5
    finally:
        cache.set_redis_client(None)
