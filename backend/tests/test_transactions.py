"""T01/T02: adding expenses and income, with whole-pence amounts, safe retries,
and strict separation between users (Alice can never use or see Bob's data)."""

import uuid
from datetime import timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, IntegrityError

from app.transactions import today_in_london
from tests.conftest import new_client


def _categories(browser, kind):
    r = browser.get("/api/categories")
    assert r.status_code == 200, r.text
    return {c["name"]: c["id"] for c in r.json()["data"] if c["category_type"] == kind}


def _entry(browser, **overrides):
    body = {
        "transaction_type": "expense",
        "amount_pence": 1250,
        "category_id": overrides.get("category_id") or _categories(browser, "expense")["Groceries"],
        "occurred_on": today_in_london().isoformat(),
        "note": "Weekly shop",
    }
    body.update(overrides)
    return body


@pytest.fixture
def alice(signed_up):
    return signed_up("alice@example.test")[0]


@pytest.fixture
def bob(signed_up):
    return signed_up("bob@example.test")[0]


def test_add_expense(alice):
    r = alice.post("/api/transactions", json=_entry(alice))
    assert r.status_code == 201, r.text
    t = r.json()["data"]
    assert t["transaction_type"] == "expense"
    assert t["amount_pence"] == 1250
    assert t["category_name"] == "Groceries"
    assert t["note"] == "Weekly shop"
    assert t["version"] == 1
    assert "user_id" not in t


def test_add_income(alice):
    salary = _categories(alice, "income")["Salary"]
    r = alice.post(
        "/api/transactions",
        json=_entry(alice, transaction_type="income", category_id=salary, amount_pence=250000, note=None),
    )
    assert r.status_code == 201, r.text
    assert r.json()["data"]["category_name"] == "Salary"
    assert r.json()["data"]["note"] is None


@pytest.mark.parametrize("amount", [0, -100, 100_000_000, 12.5, "1250", True, None])
def test_amount_must_be_whole_pence_in_range(alice, amount):
    r = alice.post("/api/transactions", json=_entry(alice, amount_pence=amount))
    assert r.status_code == 422
    assert "amount_pence" in r.json()["error"]["field_errors"]


def test_largest_and_smallest_amounts_are_allowed(alice):
    for amount in (1, 99_999_999):
        r = alice.post("/api/transactions", json=_entry(alice, amount_pence=amount))
        assert r.status_code == 201, r.text


def test_future_date_is_refused(alice):
    tomorrow = (today_in_london() + timedelta(days=1)).isoformat()
    r = alice.post("/api/transactions", json=_entry(alice, occurred_on=tomorrow))
    assert r.status_code == 422
    assert "occurred_on" in r.json()["error"]["field_errors"]


def test_very_old_date_is_refused(alice):
    r = alice.post("/api/transactions", json=_entry(alice, occurred_on="1999-12-31"))
    assert r.status_code == 422


def test_note_is_trimmed_blank_becomes_empty_and_long_is_refused(alice):
    r = alice.post("/api/transactions", json=_entry(alice, note="  lunch  "))
    assert r.json()["data"]["note"] == "lunch"
    r = alice.post("/api/transactions", json=_entry(alice, note="   "))
    assert r.json()["data"]["note"] is None
    r = alice.post("/api/transactions", json=_entry(alice, note="x" * 141))
    assert r.status_code == 422


def test_income_category_cannot_be_used_for_expense(alice):
    salary = _categories(alice, "income")["Salary"]
    r = alice.post("/api/transactions", json=_entry(alice, category_id=salary))
    assert r.status_code == 422
    assert "category_id" in r.json()["error"]["field_errors"]


def test_archived_category_is_refused(alice, engine):
    groceries = _categories(alice, "expense")["Groceries"]
    with engine.begin() as conn:
        conn.execute(text("update categories set archived_at = now() where id = :id"), {"id": groceries})
    r = alice.post("/api/transactions", json=_entry(alice, category_id=groceries))
    assert r.status_code == 422


def test_alice_cannot_use_bobs_category(alice, bob):
    bobs = _categories(bob, "expense")["Groceries"]
    r = alice.post("/api/transactions", json=_entry(alice, category_id=bobs))
    assert r.status_code == 422
    assert r.json()["error"]["field_errors"]["category_id"] == "Choose a category"


def test_owner_cannot_be_set_from_the_request(alice, bob):
    body = _entry(alice) | {"user_id": str(uuid.uuid4())}
    r = alice.post("/api/transactions", json=body)
    assert r.status_code == 422


def test_recent_lists_only_your_own_entries_newest_first(alice, bob):
    yesterday = (today_in_london() - timedelta(days=1)).isoformat()
    alice.post("/api/transactions", json=_entry(alice, occurred_on=yesterday, note="older"))
    alice.post("/api/transactions", json=_entry(alice, note="newer"))
    bob.post("/api/transactions", json=_entry(bob, note="bob's"))

    notes = [t["note"] for t in alice.get("/api/transactions/recent").json()["data"]]
    assert notes == ["newer", "older"]
    assert [t["note"] for t in bob.get("/api/transactions/recent").json()["data"]] == ["bob's"]


def test_signed_out_requests_are_refused(alice):
    body = _entry(alice)
    stranger = new_client()
    assert stranger.post("/api/transactions", json=body).status_code == 401
    assert stranger.get("/api/transactions/recent").status_code == 401


def test_request_without_csrf_header_is_refused(alice):
    body = _entry(alice)
    r = alice.post("/api/transactions", json=body, headers={"X-Requested-With": ""})
    assert r.status_code == 403


def test_retry_with_same_key_saves_once(alice):
    key = str(uuid.uuid4())
    body = _entry(alice)
    first = alice.post("/api/transactions", json=body, headers={"Idempotency-Key": key})
    second = alice.post("/api/transactions", json=body, headers={"Idempotency-Key": key})
    assert first.status_code == 201
    assert second.status_code == 200
    assert first.json()["data"]["id"] == second.json()["data"]["id"]
    assert len(alice.get("/api/transactions/recent").json()["data"]) == 1


def test_same_key_with_different_entry_is_refused(alice):
    key = str(uuid.uuid4())
    alice.post("/api/transactions", json=_entry(alice), headers={"Idempotency-Key": key})
    r = alice.post("/api/transactions", json=_entry(alice, amount_pence=999), headers={"Idempotency-Key": key})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "idempotency_conflict"


def test_keys_are_separate_per_user(alice, bob):
    key = str(uuid.uuid4())
    assert alice.post("/api/transactions", json=_entry(alice), headers={"Idempotency-Key": key}).status_code == 201
    assert bob.post("/api/transactions", json=_entry(bob), headers={"Idempotency-Key": key}).status_code == 201


def test_bad_idempotency_key_is_refused(alice):
    r = alice.post("/api/transactions", json=_entry(alice), headers={"Idempotency-Key": "not-a-uuid"})
    assert r.status_code == 422


def test_saving_marks_cached_totals_out_of_date(alice, engine):
    def revision():
        with engine.begin() as conn:
            return conn.execute(
                text("select finance_revision from profiles p join users u on u.id = p.id "
                     "where u.email = 'alice@example.test'")
            ).scalar()

    before = revision()
    alice.post("/api/transactions", json=_entry(alice))
    assert revision() == before + 1


# The database's own rules, in case a future bug in the API lets a bad row through.

def _user_and_category(engine, email, kind="expense"):
    with engine.begin() as conn:
        return conn.execute(
            text("select u.id, c.id from users u join categories c on c.user_id = u.id "
                 "where u.email = :e and c.category_type = :k limit 1"),
            {"e": email, "k": kind},
        ).one()


def _raw_insert(engine, user_id, category_id, kind="expense", amount=100):
    with engine.begin() as conn:
        conn.execute(
            text("insert into transactions (user_id, category_id, transaction_type, amount_pence, occurred_on) "
                 "values (:u, :c, :k, :a, current_date)"),
            {"u": user_id, "c": category_id, "k": kind, "a": amount},
        )


def test_database_refuses_another_users_category(alice, bob, engine):
    alice_id, _ = _user_and_category(engine, "alice@example.test")
    _, bobs_category = _user_and_category(engine, "bob@example.test")
    with pytest.raises(IntegrityError):
        _raw_insert(engine, alice_id, bobs_category)


def test_database_refuses_mismatched_category_type(alice, engine):
    alice_id, income_category = _user_and_category(engine, "alice@example.test", "income")
    with pytest.raises(DBAPIError):
        _raw_insert(engine, alice_id, income_category, kind="expense")


def test_database_refuses_zero_amount(alice, engine):
    alice_id, category = _user_and_category(engine, "alice@example.test")
    with pytest.raises(IntegrityError):
        _raw_insert(engine, alice_id, category, amount=0)


def test_browser_roles_cannot_read_transactions(engine):
    with engine.begin() as conn:
        for role in ("anon", "authenticated"):
            allowed = conn.execute(
                text("select has_table_privilege(:r, 'public.transactions', 'select')"), {"r": role}
            ).scalar()
            assert allowed is False
