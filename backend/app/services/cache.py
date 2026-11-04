"""Shared state that must survive across requests (and, with Redis, across API instances).

* CatalogCache keeps the loaded and scored catalogue in memory. Scoring needs every car
  (scores are relative to the catalogue), so without a cache each request re-reads the
  whole table. Any write to the catalogue bumps a version number and the next request
  reloads. With Redis the version is shared, so all instances reload; a TTL covers edits
  made directly in the database.
* Counter implements the fixed-window counters behind rate limiting and login lockout,
  in memory or in Redis.
"""

import threading
import time
from collections import defaultdict
from collections.abc import Callable
from typing import Any

from ..config import get_settings

_redis = None


def redis_client():
    """The configured Redis client, or None when AUTOWISE_REDIS_URL is empty."""
    global _redis
    url = get_settings().redis_url
    if not url:
        return None
    if _redis is None:
        import redis

        _redis = redis.Redis.from_url(url, decode_responses=True, socket_timeout=2)
    return _redis


def set_redis_client(client) -> None:
    """For tests: inject a (fake) Redis client."""
    global _redis
    _redis = client


VERSION_KEY = "autowise:catalog_version"


class CatalogCache:
    def __init__(self, ttl: float = 300) -> None:
        self.ttl = ttl
        self._local_version = 0
        self._entries: dict[tuple, tuple[float, Any]] = {}
        self._lock = threading.Lock()

    def version(self) -> str:
        r = redis_client()
        if r is not None:
            try:
                return str(r.get(VERSION_KEY) or 0)
            except Exception:
                pass  # Redis down: fall back to this instance's counter and the TTL
        return f"local-{self._local_version}"

    def bump(self) -> None:
        """Call after any change to modifications, issues or the hierarchy."""
        with self._lock:
            self._local_version += 1
            self._entries.clear()
        r = redis_client()
        if r is not None:
            try:
                r.incr(VERSION_KEY)
            except Exception:
                pass

    def get(self, key: tuple, build: Callable[[], Any]) -> Any:
        full = (self.version(), *key)
        now = time.monotonic()
        hit = self._entries.get(full)
        if hit and now - hit[0] < self.ttl:
            return hit[1]
        value = build()
        with self._lock:
            # Keep only entries of the current version; a handful of fuel-price variants at most.
            self._entries = {k: v for k, v in self._entries.items() if k[0] == full[0]}
            if len(self._entries) >= 16:
                self._entries.pop(next(iter(self._entries)))
            self._entries[full] = (now, value)
        return value


catalog_cache = CatalogCache()


class Counter:
    """Fixed-window counter: hit() returns how many hits the key has in the current window."""

    def __init__(self, prefix: str, window: int) -> None:
        self.prefix, self.window = prefix, window
        self._mem: dict[str, list[float]] = defaultdict(list)
        self._lock = threading.Lock()

    def _redis_key(self, key: str) -> str:
        return f"autowise:{self.prefix}:{key}:{int(time.time() // self.window)}"

    def count(self, key: str) -> int:
        r = redis_client()
        if r is not None:
            try:
                return int(r.get(self._redis_key(key)) or 0)
            except Exception:
                pass
        with self._lock:
            now = time.monotonic()
            self._mem[key] = [t for t in self._mem[key] if now - t < self.window]
            return len(self._mem[key])

    def hit(self, key: str) -> int:
        r = redis_client()
        if r is not None:
            try:
                k = self._redis_key(key)
                pipe = r.pipeline()
                pipe.incr(k)
                pipe.expire(k, self.window)
                return int(pipe.execute()[0])
            except Exception:
                pass
        with self._lock:
            now = time.monotonic()
            self._mem[key] = [t for t in self._mem[key] if now - t < self.window] + [now]
            return len(self._mem[key])

    def reset(self, key: str) -> None:
        r = redis_client()
        if r is not None:
            try:
                r.delete(self._redis_key(key))
            except Exception:
                pass
        with self._lock:
            self._mem.pop(key, None)
