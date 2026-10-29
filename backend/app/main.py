from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import account, admin, public
from .security import RateLimitMiddleware

settings = get_settings()

app = FastAPI(
    title="AutoWise API",
    version="1.0.0",
    description="Каталог, порівняння модифікацій, вартість володіння, рейтинги й аналіз оголошень.",
)
app.add_middleware(RateLimitMiddleware, per_minute=settings.rate_limit_per_minute)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(public.router)
app.include_router(account.router)
app.include_router(admin.router)
