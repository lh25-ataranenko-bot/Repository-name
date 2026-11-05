import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings, production_problems
from .db import SessionLocal
from .routers import account, admin, photos, popular, public, reviews
from .security import RateLimitMiddleware
from .services.photos import media_root

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.env == "production":
        errors, warnings = production_problems(settings)
        for w in warnings:
            logging.getLogger("autowise").warning(w)
        if errors:
            raise RuntimeError("Небезпечні налаштування для production:\n- " + "\n- ".join(errors))
    # Load and score the catalogue once, so the first visitor does not wait for it.
    try:
        with SessionLocal() as db:
            public.scored(db)
    except Exception:  # database not migrated yet, etc.: the first request will retry
        logging.getLogger("autowise").warning("Каталог не вдалося завантажити під час запуску", exc_info=True)
    yield


app = FastAPI(
    lifespan=lifespan,
    # Swagger is handy in development; in production the schema stays private.
    docs_url=None if settings.env == "production" else "/docs",
    redoc_url=None,
    openapi_url=None if settings.env == "production" else "/openapi.json",
    title="AutoWise API",
    version="1.0.0",
    description="Каталог, порівняння модифікацій, вартість володіння, рейтинги й аналіз оголошень.",
)
app.add_middleware(RateLimitMiddleware, per_minute=settings.rate_limit_per_minute,
                   trust_forwarded_for=settings.trust_forwarded_for)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(public.router)
app.include_router(account.router)
app.include_router(admin.router)
app.include_router(reviews.router)
app.include_router(popular.router)
app.include_router(photos.router)
# Uploaded photos. Mounted under /api so the site proxy and Caddy route them to the API as well.
app.mount("/api/media", StaticFiles(directory=media_root(), check_dir=False), name="media")
