"""App settings, read from environment variables or backend/.env."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Empty values are allowed so the app can start; endpoints that need them answer 503.
    DATABASE_URL: str = ""
    # Signs session cookies. Long random text, kept secret, never committed.
    APP_SECRET_KEY: str = ""
    SESSION_DAYS: int = 7
    # True in production (HTTPS). False for http://localhost during development.
    COOKIE_SECURE: bool = False
    APP_ENV: str = "development"

    @property
    def sqlalchemy_database_url(self) -> str:
        """DATABASE_URL using the psycopg (v3) driver, as SQLAlchemy expects."""
        url = self.DATABASE_URL
        for prefix in ("postgresql://", "postgres://"):
            if url.startswith(prefix):
                return "postgresql+psycopg://" + url[len(prefix) :]
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()
