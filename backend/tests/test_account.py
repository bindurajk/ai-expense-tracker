"""Account setup: profile + default categories, safe to retry, separate per user,
plus the database rules that protect them."""

import threading
import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, IntegrityError

from app.accounts import (
    DEFAULT_EXPENSE_CATEGORIES,
    DEFAULT_INCOME_CATEGORIES,
    initialise_account,
)
from app.config import get_settings
from app.security import SESSION_COOKIE, create_session_token, hash_password
from tests.conftest import new_client

TOTAL_DEFAULTS = len(DEFAULT_EXPENSE_CATEGORIES) + len(DEFAULT_INCOME_CATEGORIES)


@pytest.fixture
def bare_user(engine):
    """A user row with no profile yet, and a browser signed in as them."""
    user_id = uuid.uuid4()
    with engine.begin() as conn:
        conn.execute(
            text("insert into users (id, email, password_hash) values (:id, :e, :h)"),
            {
                "id": user_id,
                "e": f"{user_id.hex[:8]}@example.test",
                "h": hash_password("pw-12345678"),
            },
        )
    browser = new_client()
    browser.cookies.set(
        SESSION_COOKIE, create_session_token(user_id, 1, get_settings()), path="/api"
    )
    return user_id, browser


def _init(browser):
    r = browser.post("/api/account/initialise")
    assert r.status_code == 200, r.text
    return r.json()["data"]


def test_initialise_creates_profile_and_typed_default_categories(bare_user):
    _, browser = bare_user
    data = _init(browser)
    assert data["created"] is True
    assert data["profile"]["currency"] == "GBP"
    assert data["profile"]["timezone"] == "Europe/London"
    assert data["profile"]["locale"] == "en-GB"

    by_type = {"expense": [], "income": []}
    for c in data["categories"]:
        by_type[c["category_type"]].append(c["name"])
    assert sorted(by_type["expense"]) == sorted(DEFAULT_EXPENSE_CATEGORIES)
    assert sorted(by_type["income"]) == sorted(DEFAULT_INCOME_CATEGORIES)
    # "Other" exists separately for each type
    assert by_type["expense"][-1] == "Other" and by_type["income"][-1] == "Other"


def test_retry_creates_no_duplicates_and_keeps_ids(bare_user):
    _, browser = bare_user
    first = _init(browser)
    second = _init(browser)
    assert second["created"] is False
    assert [c["id"] for c in second["categories"]] == [
        c["id"] for c in first["categories"]
    ]
    assert len(second["categories"]) == TOTAL_DEFAULTS


def test_concurrent_initialise_creates_one_set(engine, bare_user):
    user, _ = bare_user
    results, errors = [], []
    barrier = threading.Barrier(6)

    def worker():
        try:
            barrier.wait()
            with engine.begin() as conn:
                results.append(initialise_account(conn, user)[0])
        except Exception as exc:  # noqa: BLE001 - collected and asserted below
            errors.append(exc)

    threads = [threading.Thread(target=worker) for _ in range(6)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors
    assert results.count(True) == 1
    with engine.connect() as conn:
        count = conn.execute(
            text("select count(*) from categories where user_id = :u"), {"u": user}
        ).scalar()
    assert count == TOTAL_DEFAULTS


def test_rerun_never_resets_user_changes(bare_user, engine):
    user, browser = bare_user
    _init(browser)
    with engine.begin() as conn:
        conn.execute(
            text(
                "update categories set name = 'Food shop' where user_id = :u and name = 'Groceries'"
            ),
            {"u": user},
        )
    names = [c["name"] for c in _init(browser)["categories"]]
    assert "Food shop" in names and "Groceries" not in names


def test_profile_before_setup_is_404(bare_user):
    _, browser = bare_user
    r = browser.get("/api/profile")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "profile_not_initialised"


def test_archived_categories_hidden_unless_requested(bare_user, engine):
    user, browser = bare_user
    _init(browser)
    with engine.begin() as conn:
        conn.execute(
            text(
                "update categories set archived_at = now() where user_id = :u and name = 'Health'"
            ),
            {"u": user},
        )
    active = browser.get("/api/categories").json()["data"]
    everything = browser.get("/api/categories?include_archived=true").json()["data"]
    assert "Health" not in [c["name"] for c in active]
    assert "Health" in [c["name"] for c in everything]


# --- Database rules (they hold even if application code is wrong) ---


@pytest.fixture
def seeded_user(bare_user):
    user, browser = bare_user
    _init(browser)
    return user


def _expect_db_error(engine, sql, params, error=IntegrityError):
    with pytest.raises(error), engine.begin() as conn:
        conn.execute(text(sql), params)


def test_category_names_unique_ignoring_case(engine, seeded_user):
    sql = "insert into categories (user_id, name, category_type) values (:u, :n, 'expense')"
    _expect_db_error(engine, sql, {"u": seeded_user, "n": "groceries"})
    _expect_db_error(engine, sql, {"u": seeded_user, "n": "GROCERIES"})


@pytest.mark.parametrize("name", ["", " Padded", "Padded ", "x" * 41])
def test_category_name_must_be_trimmed_and_1_to_40_chars(engine, seeded_user, name):
    sql = "insert into categories (user_id, name, category_type) values (:u, :n, 'expense')"
    _expect_db_error(engine, sql, {"u": seeded_user, "n": name})


def test_category_type_cannot_change(engine, seeded_user):
    _expect_db_error(
        engine,
        "update categories set category_type = 'income' where user_id = :u and name = 'Groceries'",
        {"u": seeded_user},
        DBAPIError,
    )


def test_only_gbp_london_profiles(engine, seeded_user):
    _expect_db_error(
        engine, "update profiles set currency = 'USD' where id = :u", {"u": seeded_user}
    )


@pytest.mark.parametrize(
    "email",
    ["Upper@example.test", " padded@example.test", "no-at-sign"],
)
def test_users_table_rejects_unnormalised_emails(engine, email):
    _expect_db_error(
        engine,
        "insert into users (email, password_hash) values (:e, '$argon2id$x')",
        {"e": email},
    )


def test_users_table_rejects_plain_text_passwords(engine):
    _expect_db_error(
        engine,
        "insert into users (email, password_hash) values ('a@example.test', 'hunter2')",
        {},
    )


def test_browser_roles_have_no_access(engine):
    tables = (
        "public.users",
        "public.profiles",
        "public.categories",
        "public.alembic_version",
    )
    with engine.connect() as conn:
        for role in ("anon", "authenticated"):
            for table in tables:
                for priv in ("select", "insert", "update", "delete"):
                    allowed = conn.execute(
                        text("select has_table_privilege(:r, :t, :p)"),
                        {"r": role, "t": table, "p": priv},
                    ).scalar()
                    assert allowed is False, f"{role} has {priv} on {table}"
        rls = conn.execute(
            text(
                "select bool_and(relrowsecurity) from pg_class where relnamespace = 'public'::regnamespace "
                "and relname in ('users', 'profiles', 'categories', 'alembic_version')"
            )
        ).scalar()
        assert rls is True


def test_deleting_a_user_removes_all_their_data(engine, seeded_user):
    with engine.begin() as conn:
        conn.execute(text("delete from users where id = :u"), {"u": seeded_user})
        for table, col in (("profiles", "id"), ("categories", "user_id")):
            left = conn.execute(
                text(f"select count(*) from {table} where {col} = :u"),
                {"u": seeded_user},
            ).scalar()
            assert left == 0


def test_new_tables_start_locked_for_browser_roles(engine):
    """Tables added by future migrations must not be exposed by default."""
    with engine.begin() as conn:
        conn.execute(text("create table public.tmp_future_table (id int)"))
        try:
            for role in ("anon", "authenticated"):
                allowed = conn.execute(
                    text(
                        "select has_table_privilege(:r, 'public.tmp_future_table', 'select')"
                    ),
                    {"r": role},
                ).scalar()
                assert allowed is False
        finally:
            conn.execute(text("drop table public.tmp_future_table"))
