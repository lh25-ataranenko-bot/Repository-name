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


@lru_cache
def get_settings() -> Settings:
    return Settings()
