"""Test setup: a throwaway local PostgreSQL (via pgserver), migrated to the latest schema.

Supabase's auth.users table is imitated with just the columns the backend reads.
All users, tokens and secrets here are fake test values.
"""

import os
import tempfile
import time
import uuid
from pathlib import Path

# Fake settings, applied before the app is imported.
TEST_SUPABASE_URL = "https://test-project.supabase.co"
TEST_JWT_SECRET = "test-only-secret-not-used-anywhere-0123456789"
os.environ["SUPABASE_URL"] = TEST_SUPABASE_URL
os.environ["SUPABASE_JWT_SECRET"] = TEST_JWT_SECRET
os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = ""

import jwt
import psycopg
import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.config import get_settings
from app.db import get_engine

BACKEND_DIR = Path(__file__).resolve().parent.parent

FAKE_SUPABASE_SQL = """
create schema if not exists auth;
create table auth.users (
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz,
  banned_until timestamptz,
  deleted_at timestamptz
);
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;
grant usage on schema public to anon, authenticated;
-- Like real Supabase: new tables in public are granted to the browser roles by default.
alter default privileges in schema public grant all on tables to anon, authenticated;
"""


@pytest.fixture(scope="session")
def database_url():
    import pgserver

    server = pgserver.get_server(
        tempfile.mkdtemp(prefix="spendwise-pg-"), cleanup_mode="stop"
    )
    base = server.get_uri()
    with psycopg.connect(base, autocommit=True) as conn:
        conn.execute("drop database if exists spendwise_test")
        conn.execute("create database spendwise_test")
    url = base.rsplit("/", 1)[0] + "/spendwise_test"
    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute(FAKE_SUPABASE_SQL)

    os.environ["DATABASE_URL"] = url
    get_settings.cache_clear()
    get_engine.cache_clear()
    command.upgrade(Config(str(BACKEND_DIR / "alembic.ini")), "head")
    yield url
    get_engine().dispose()
    server.cleanup()


@pytest.fixture
def engine(database_url):
    eng = get_engine()
    yield eng
    with eng.begin() as conn:
        conn.execute(text("truncate auth.users cascade"))


@pytest.fixture
def client(engine):
    from app.main import app

    return TestClient(app)


@pytest.fixture
def make_user(engine):
    """Create a fake Supabase auth user. Returns its UUID."""

    def _make(email: str | None = None, confirmed: bool = True, **extra) -> uuid.UUID:
        user_id = uuid.uuid4()
        with engine.begin() as conn:
            conn.execute(
                text(
                    "insert into auth.users (id, email, email_confirmed_at, banned_until, deleted_at) "
                    "values (:id, :email, case when :confirmed then now() end, :banned, :deleted)"
                ),
                {
                    "id": user_id,
                    "email": email or f"{user_id.hex[:8]}@example.test",
                    "confirmed": confirmed,
                    "banned": extra.get("banned_until"),
                    "deleted": extra.get("deleted_at"),
                },
            )
        return user_id

    return _make


def make_token(
    user_id: uuid.UUID | str, *, secret: str = TEST_JWT_SECRET, **overrides
) -> str:
    now = int(time.time())
    claims = {
        "sub": str(user_id),
        "aud": "authenticated",
        "role": "authenticated",
        "iss": f"{TEST_SUPABASE_URL}/auth/v1",
        "iat": now,
        "exp": now + 3600,
    }
    claims.update(overrides)
    claims = {k: v for k, v in claims.items() if v is not None}
    return jwt.encode(claims, secret, algorithm="HS256")


def auth_header(user_id, **overrides) -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(user_id, **overrides)}"}
