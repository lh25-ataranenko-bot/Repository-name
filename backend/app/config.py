from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


DEV_JWT_SECRET = "dev-only-secret-change-me-in-production-0123456789"
DEV_ADMIN_PASSWORD = "change-me-now"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="AUTOWISE_", extra="ignore")

    # "production" turns on the startup safety checks below.
    env: str = "development"

    database_url: str = "postgresql+psycopg://autowise:autowise@localhost:5432/autowise"
    jwt_secret: str = DEV_JWT_SECRET
    jwt_ttl_minutes: int = 60 * 24 * 7
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:8081"]
    admin_email: str = "admin@autowise.local"
    admin_password: str = DEV_ADMIN_PASSWORD
    rate_limit_per_minute: int = 300
    login_attempts_per_15min: int = 5
    # Optional. Shares the catalogue cache version, rate limits and login lockout between API instances.
    redis_url: str = ""
    catalog_cache_ttl: int = 300

    # Email. Without smtp_host letters are only written to the log (development).
    app_url: str = "http://localhost:3000"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "AutoWise <no-reply@autowise.local>"
    smtp_starttls: bool = True
    # The website proxies /api/* to the backend, so the client IP arrives in X-Forwarded-For.
    # Keep True only while the API is reachable solely through that proxy.
    trust_forwarded_for: bool = True

    # AI assistant. Without a key (here or ANTHROPIC_API_KEY) it answers with the rule-based picker.
    anthropic_api_key: str = ""
    assistant_model: str = "claude-opus-5-5"
    assistant_per_minute: int = 10

    # Default assumptions for cost calculations (editable by the user per request)
    petrol_uah: float = 58.5
    diesel_uah: float = 55.9
    kwh_uah: float = 4.32
    usd_rate: float = 41.6
    km_per_year: int = 15000
    other_per_year: float = 250
    current_year: int = 2026


def production_problems(s: Settings) -> tuple[list[str], list[str]]:
    """(errors that must stop the start, warnings). Only checked when env == "production"."""
    errors, warnings = [], []
    if s.jwt_secret == DEV_JWT_SECRET or len(s.jwt_secret) < 32:
        errors.append("AUTOWISE_JWT_SECRET: задайте випадковий рядок щонайменше з 32 символів")
    if s.admin_password == DEV_ADMIN_PASSWORD or len(s.admin_password) < 12:
        errors.append("AUTOWISE_ADMIN_PASSWORD: задайте власний пароль щонайменше з 12 символів")
    if "autowise:autowise@" in s.database_url:
        errors.append("AUTOWISE_DATABASE_URL: змініть стандартний пароль бази даних")
    if not s.app_url.startswith("https://"):
        errors.append("AUTOWISE_APP_URL: адреса сайту має починатися з https://")
    if not s.smtp_host:
        warnings.append("AUTOWISE_SMTP_HOST не задано: листи (підтвердження пошти, відновлення пароля) не надсилатимуться")
    if not s.redis_url:
        warnings.append("AUTOWISE_REDIS_URL не задано: кеш і ліміти працюють лише в межах одного процесу")
    return errors, warnings


@lru_cache
def get_settings() -> Settings:
    return Settings()
