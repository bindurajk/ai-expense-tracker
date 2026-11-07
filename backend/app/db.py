"""Database connection (Supabase PostgreSQL in development/production, a local one in tests)."""

from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import Connection, Engine, create_engine
from sqlalchemy.exc import OperationalError

from app.config import get_settings
from app.errors import service_unavailable


@lru_cache
def get_engine() -> Engine:
    url = get_settings().sqlalchemy_database_url
    if not url:
        raise service_unavailable("The database is not configured yet.")
    return create_engine(
        url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=5,
        # Server-side prepared statements break behind Supabase's poolers; turn them off.
        connect_args={"prepare_threshold": None, "connect_timeout": 10},
    )


def get_conn() -> Iterator[Connection]:
    """FastAPI dependency: one connection per request, inside one transaction.

    If the request fails, everything it wrote is rolled back.
    """
    try:
        conn = get_engine().connect()
    except OperationalError as exc:
        raise service_unavailable("The database is not reachable right now.") from exc
    with conn, conn.begin():
        yield conn
