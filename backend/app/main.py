import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .db import SessionLocal
from .routers import account, admin, public
from .security import RateLimitMiddleware

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Load and score the catalogue once, so the first visitor does not wait for it.
    try:
        with SessionLocal() as db:
            public.scored(db)
    except Exception:  # database not migrated yet, etc.: the first request will retry
        logging.getLogger("autowise").warning("Каталог не вдалося завантажити під час запуску", exc_info=True)
    yield


app = FastAPI(
    lifespan=lifespan,
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
