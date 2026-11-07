"""A01 account setup: profile + default categories, safe to retry, separate per user."""

import threading

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, IntegrityError

from app.accounts import (
    DEFAULT_EXPENSE_CATEGORIES,
    DEFAULT_INCOME_CATEGORIES,
    initialise_account,
)
from tests.conftest import auth_header

TOTAL_DEFAULTS = len(DEFAULT_EXPENSE_CATEGORIES) + len(DEFAULT_INCOME_CATEGORIES)


def _init(client, user):
    r = client.post("/api/account/initialise", headers=auth_header(user))
    assert r.status_code == 200, r.text
    return r.json()["data"]


def test_initialise_creates_profile_and_typed_default_categories(client, make_user):
    data = _init(client, make_user())
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


def test_retry_creates_no_duplicates_and_keeps_ids(client, make_user):
    user = make_user()
    first = _init(client, user)
    second = _init(client, user)
    assert second["created"] is False
    assert [c["id"] for c in second["categories"]] == [
        c["id"] for c in first["categories"]
    ]
    assert len(second["categories"]) == TOTAL_DEFAULTS


def test_concurrent_initialise_creates_one_set(engine, make_user):
    user = make_user()
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


def test_rerun_never_resets_user_changes(client, make_user, engine):
    user = make_user()
    _init(client, user)
    with engine.begin() as conn:
        conn.execute(
            text(
                "update categories set name = 'Food shop' where user_id = :u and name = 'Groceries'"
            ),
            {"u": user},
        )
    names = [c["name"] for c in _init(client, user)["categories"]]
    assert "Food shop" in names and "Groceries" not in names


def test_two_users_get_separate_categories(client, make_user):
    alice, bob = make_user("alice@example.test"), make_user("bob@example.test")
    alice_ids = {c["id"] for c in _init(client, alice)["categories"]}
    bob_ids = {c["id"] for c in _init(client, bob)["categories"]}
    assert alice_ids.isdisjoint(bob_ids)

    r = client.get("/api/categories", headers=auth_header(bob))
    assert {c["id"] for c in r.json()["data"]} == bob_ids


def test_profile_before_setup_is_404(client, make_user):
    r = client.get("/api/profile", headers=auth_header(make_user()))
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "profile_not_initialised"


def test_archived_categories_hidden_unless_requested(client, make_user, engine):
    user = make_user()
    _init(client, user)
    with engine.begin() as conn:
        conn.execute(
            text(
                "update categories set archived_at = now() where user_id = :u and name = 'Health'"
            ),
            {"u": user},
        )
    active = client.get("/api/categories", headers=auth_header(user)).json()["data"]
    everything = client.get(
        "/api/categories?include_archived=true", headers=auth_header(user)
    ).json()["data"]
    assert "Health" not in [c["name"] for c in active]
    assert "Health" in [c["name"] for c in everything]


# --- Database rules (they hold even if application code is wrong) ---


@pytest.fixture
def seeded_user(client, make_user):
    user = make_user()
    _init(client, user)
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


def test_browser_roles_have_no_access(engine):
    with engine.connect() as conn:
        for role in ("anon", "authenticated"):
            for table in ("public.profiles", "public.categories"):
                for priv in ("select", "insert", "update", "delete"):
                    allowed = conn.execute(
                        text("select has_table_privilege(:r, :t, :p)"),
                        {"r": role, "t": table, "p": priv},
                    ).scalar()
                    assert allowed is False, f"{role} has {priv} on {table}"
        rls = conn.execute(
            text(
                "select bool_and(relrowsecurity) from pg_class where relname in ('profiles', 'categories')"
            )
        ).scalar()
        assert rls is True


def test_deleting_auth_user_removes_their_data(engine, seeded_user):
    with engine.begin() as conn:
        conn.execute(text("delete from auth.users where id = :u"), {"u": seeded_user})
        left = conn.execute(
            text("select count(*) from categories where user_id = :u"),
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
            for role in ("anon", "authenticated"):
                assert (
                    conn.execute(
                        text(
                            "select has_table_privilege(:r, 'public.alembic_version', 'select')"
                        ),
                        {"r": role},
                    ).scalar()
                    is False
                )
        finally:
            conn.execute(text("drop table public.tmp_future_table"))
