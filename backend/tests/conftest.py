"""Test setup: a throwaway local PostgreSQL (via pgserver), migrated to the latest schema.

The database imitates Supabase where the migrations need it (an auth schema and the
browser roles). All users, passwords and secrets here are fake test values.
"""

import os
import tempfile
from pathlib import Path

# Fake settings, applied before the app is imported.
TEST_SECRET = "test-only-secret-key-not-used-anywhere-0123456789"
os.environ["APP_SECRET_KEY"] = TEST_SECRET
os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = ""

import psycopg
import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.config import get_settings
from app.db import get_engine
from app.security import failed_login_ip_limiter, failed_login_limiter, signup_limiter

BACKEND_DIR = Path(__file__).resolve().parent.parent
PASSWORD = "correct-horse-battery"

FAKE_SUPABASE_SQL = """
create schema if not exists auth;
create table auth.users (id uuid primary key);
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
        conn.execute(text("truncate public.users cascade"))


@pytest.fixture(autouse=True)
def _reset_limiters():
    for limiter in (failed_login_limiter, failed_login_ip_limiter, signup_limiter):
        limiter.clear()
    yield


def new_client() -> TestClient:
    """A separate "browser": its own cookie jar, and the header our CSRF guard requires."""
    from app.main import app

    return TestClient(app, headers={"X-Requested-With": "SpendWise"})


@pytest.fixture
def client(engine):
    return new_client()


@pytest.fixture
def signed_up(engine):
    """Sign up a user in a fresh browser. Returns (client, user_dict)."""

    def _signup(email: str, password: str = PASSWORD):
        c = new_client()
        r = c.post("/api/auth/signup", json={"email": email, "password": password})
        assert r.status_code == 201, r.text
        return c, r.json()["data"]["user"]

    return _signup
