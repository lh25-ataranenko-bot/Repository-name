from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="AUTOWISE_", extra="ignore")

    database_url: str = "postgresql+psycopg://autowise:autowise@localhost:5432/autowise"
    jwt_secret: str = "dev-only-secret-change-me-in-production-0123456789"
    jwt_ttl_minutes: int = 60 * 24 * 7
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:8081"]
    admin_email: str = "admin@autowise.local"
    admin_password: str = "change-me-now"
    rate_limit_per_minute: int = 120

    # Default assumptions for cost calculations (editable by the user per request)
    petrol_uah: float = 58.5
    diesel_uah: float = 55.9
    kwh_uah: float = 4.32
    usd_rate: float = 41.6
    km_per_year: int = 15000
    other_per_year: float = 250
    current_year: int = 2026


@lru_cache
def get_settings() -> Settings:
    return Settings()
