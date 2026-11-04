"""The assistant loop with a scripted stand-in for the Claude API (no network)."""

import json
from types import SimpleNamespace as NS

from app.services import assistant


class FakeClient:
    def __init__(self, script):
        self.script = list(script)
        self.calls = []
        self.beta = NS(messages=NS(create=self.create))

    def create(self, **kw):
        self.calls.append({**kw, "messages": list(kw["messages"])})  # snapshot: the loop keeps appending
        return self.script.pop(0)


def tool_use(id_, name, args):
    return NS(stop_reason="tool_use", model="claude-opus-5-5",
              content=[NS(type="text", text="Шукаю…"), NS(type="tool_use", id=id_, name=name, input=args)])


def final(text):
    return NS(stop_reason="end_turn", model="claude-opus-5-5", content=[NS(type="text", text=text)])


def search_args(**kw):
    base = {"text": "", "max_price": 0, "year": 0, "body": "any", "fuel": "any", "transmission": "any", "drive": "any",
            "priority": "balanced"}
    return {**base, **kw}


def test_tool_loop_grounded_in_catalogue(client, monkeypatch):
    fake = FakeClient([
        tool_use("t1", "search_catalog", search_args(max_price=25000, body="crossover", priority="family")),
        tool_use("t2", "get_car", {"slug": "nope"}),
        final("Раджу Mazda CX-5."),
    ])
    monkeypatch.setattr(assistant, "_client", lambda: fake)
    r = client.post("/api/assistant", json={"messages": [{"role": "user", "text": "Кросовер до 25 тис для сім'ї"}]}).json()
    assert r["source"] == "ai" and r["answer"] == "Раджу Mazda CX-5."
    assert r["cars"] and all(c["body"] == "crossover" and c["price"] <= 25000 for c in r["cars"])
    first = fake.calls[0]
    assert first["model"] == "claude-opus-5-5" and first["fallbacks"] == "default"
    assert first["betas"] == ["server-side-fallback-2026-07-01"]
    assert all(t["strict"] for t in first["tools"])
    # tool result went back in one user message, linked to the call id
    tr = fake.calls[1]["messages"][-1]["content"][0]
    assert tr["tool_use_id"] == "t1" and not tr["is_error"] and json.loads(tr["content"])["matched"] >= 1
    err = fake.calls[2]["messages"][-1]["content"][0]
    assert err["is_error"] and "не знайдено" in err["content"]


def test_refusal_falls_back_to_rules(client, monkeypatch):
    fake = FakeClient([NS(stop_reason="refusal", model="claude-opus-5-5", content=[])])
    monkeypatch.setattr(assistant, "_client", lambda: fake)
    r = client.post("/api/assistant", json={"messages": [{"role": "user", "text": "дизель до 20000$ повний привід"}]}).json()
    assert r["source"] == "rules" and "недоступний" in r["notice"]
    assert all(c["fuel"] == "diesel" and c["drive"] == "AWD" for c in r["cars"])


def test_no_key_uses_rules(client, monkeypatch):
    monkeypatch.setattr(assistant, "_client", lambda: None)
    r = client.post("/api/assistant", json={"messages": [{"role": "user", "text": "електромобіль до 30 тис"}]}).json()
    assert r["source"] == "rules" and all(c["fuel"] == "electric" for c in r["cars"])


def test_validation_and_limit(client, monkeypatch):
    monkeypatch.setattr(assistant, "_client", lambda: None)
    assert client.post("/api/assistant", json={"messages": [{"role": "assistant", "text": "x"}]}).status_code == 422
    assert client.post("/api/assistant", json={"messages": [{"role": "user", "text": "a" * 1001}]}).status_code == 422
    codes = [client.post("/api/assistant", json={"messages": [{"role": "user", "text": "седан"}]},
                         headers={"X-Forwarded-For": "9.9.9.9"}).status_code for _ in range(11)]
    assert codes.count(429) == 1 and codes[-1] == 429


def test_runaway_loop_is_cut(client, monkeypatch):
    fake = FakeClient([tool_use(f"t{i}", "search_catalog", search_args()) for i in range(10)])
    monkeypatch.setattr(assistant, "_client", lambda: fake)
    r = client.post("/api/assistant", json={"messages": [{"role": "user", "text": "щось"}]}).json()
    assert r["source"] == "rules" and len(fake.calls) == assistant.MAX_TOOL_ROUNDS


def test_real_client_without_credentials_uses_rules(client, monkeypatch, tmp_path):
    for var in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_PROFILE"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("ANTHROPIC_CONFIG_DIR", str(tmp_path / "none"))
    r = client.post("/api/assistant", json={"messages": [{"role": "user", "text": "седан до 20 тис"}]},
                    headers={"X-Forwarded-For": "7.7.7.7"})
    assert r.status_code == 200 and r.json()["source"] == "rules"
