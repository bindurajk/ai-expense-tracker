"""Own email + password accounts: sign up, sign in, sign out, sessions and abuse limits."""

import time
import uuid

import jwt
import pytest
from sqlalchemy import text

from app.accounts import DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES
from app.config import Settings
from app.security import SESSION_COOKIE
from tests.conftest import PASSWORD, TEST_SECRET, new_client

TOTAL_DEFAULTS = len(DEFAULT_EXPENSE_CATEGORIES) + len(DEFAULT_INCOME_CATEGORIES)


def _error(r, status, code):
    assert r.status_code == status, r.text
    body = r.json()["error"]
    assert body["code"] == code
    assert body["request_id"]
    return body


# --- Sign up ---


def test_signup_signs_in_and_creates_account(client):
    r = client.post(
        "/api/auth/signup", json={"email": "alice@example.test", "password": PASSWORD}
    )
    assert r.status_code == 201
    assert r.json()["data"]["user"]["email"] == "alice@example.test"

    cookie = r.headers["set-cookie"].lower()
    for part in (f"{SESSION_COOKIE}=", "httponly", "samesite=strict", "path=/api"):
        assert part in cookie

    assert (
        client.get("/api/auth/me").json()["data"]["user"]["email"]
        == "alice@example.test"
    )
    assert client.get("/api/profile").json()["data"]["currency"] == "GBP"
    assert len(client.get("/api/categories").json()["data"]) == TOTAL_DEFAULTS


def test_password_is_stored_only_as_argon2_hash(client, engine):
    client.post(
        "/api/auth/signup", json={"email": "alice@example.test", "password": PASSWORD}
    )
    with engine.connect() as conn:
        stored = conn.execute(text("select password_hash from users")).scalar()
    assert stored.startswith("$argon2id$")
    assert PASSWORD not in stored


def test_email_is_trimmed_and_case_insensitive(client, signed_up):
    signed_up("  Alice@Example.TEST ")
    r = new_client().post(
        "/api/auth/login", json={"email": "alice@example.test", "password": PASSWORD}
    )
    assert r.status_code == 200
    assert r.json()["data"]["user"]["email"] == "alice@example.test"


def test_duplicate_signup_is_refused_without_extra_data(signed_up, engine):
    signed_up("alice@example.test")
    r = new_client().post(
        "/api/auth/signup",
        json={"email": "ALICE@example.test", "password": "another-password"},
    )
    _error(r, 409, "account_exists")
    with engine.connect() as conn:
        assert conn.execute(text("select count(*) from users")).scalar() == 1
        assert (
            conn.execute(text("select count(*) from categories")).scalar()
            == TOTAL_DEFAULTS
        )


@pytest.mark.parametrize(
    "payload,field",
    [
        ({"email": "not-an-email", "password": PASSWORD}, "email"),
        ({"email": "a@b", "password": PASSWORD}, "email"),
        ({"email": "alice@example.test", "password": "short"}, "password"),
        ({"email": "alice@example.test", "password": "x" * 129}, "password"),
    ],
)
def test_signup_validation_gives_friendly_field_errors(client, payload, field):
    body = _error(
        client.post("/api/auth/signup", json=payload), 422, "validation_failed"
    )
    assert field in body["field_errors"]
    assert not body["field_errors"][field].startswith("Value error")


# --- Sign in / sign out ---


def test_login_and_logout(signed_up):
    signed_up("alice@example.test")
    browser = new_client()
    assert browser.get("/api/auth/me").status_code == 401

    r = browser.post(
        "/api/auth/login", json={"email": "alice@example.test", "password": PASSWORD}
    )
    assert r.status_code == 200
    assert browser.get("/api/auth/me").status_code == 200

    assert browser.post("/api/auth/logout").status_code == 204
    _error(browser.get("/api/auth/me"), 401, "invalid_session")


def test_wrong_password_and_unknown_email_look_identical(signed_up):
    signed_up("alice@example.test")
    wrong = new_client().post(
        "/api/auth/login",
        json={"email": "alice@example.test", "password": "wrong-password"},
    )
    unknown = new_client().post(
        "/api/auth/login",
        json={"email": "nobody@example.test", "password": "wrong-password"},
    )
    a = _error(wrong, 401, "invalid_credentials")
    b = _error(unknown, 401, "invalid_credentials")
    assert a["message"] == b["message"] == "Email or password is incorrect."
    assert "set-cookie" not in wrong.headers


def test_repeated_failed_logins_are_rate_limited(signed_up):
    signed_up("alice@example.test")
    attacker = new_client()
    for _ in range(10):
        attacker.post(
            "/api/auth/login", json={"email": "alice@example.test", "password": "nope"}
        )
    r = attacker.post(
        "/api/auth/login", json={"email": "alice@example.test", "password": PASSWORD}
    )
    _error(r, 429, "rate_limited")
    assert int(r.headers["retry-after"]) > 0


# --- Sessions ---

PRIVATE = [
    ("get", "/api/auth/me"),
    ("get", "/api/profile"),
    ("get", "/api/categories"),
    ("post", "/api/account/initialise"),
]


@pytest.mark.parametrize("method,path", PRIVATE)
def test_signed_out_requests_are_refused(client, method, path):
    _error(getattr(client, method)(path), 401, "invalid_session")


def _forge(user_id, secret=TEST_SECRET, **overrides):
    now = int(time.time())
    claims = {
        "sub": str(user_id),
        "ver": 1,
        "typ": "session",
        "iat": now,
        "exp": now + 600,
    }
    claims.update(overrides)
    return jwt.encode(
        {k: v for k, v in claims.items() if v is not None}, secret, algorithm="HS256"
    )


@pytest.mark.parametrize(
    "overrides",
    [
        {"secret": "attacker-guessed-secret-attacker-guessed-0000"},
        {"exp": int(time.time()) - 10},
        {"typ": "refresh"},
        {"ver": 2},
        {"exp": None},
        {"sub": "not-a-uuid"},
    ],
    ids=[
        "wrong-key",
        "expired",
        "wrong-type",
        "old-version",
        "no-expiry",
        "bad-subject",
    ],
)
def test_forged_or_stale_cookies_are_refused(signed_up, overrides):
    _, alice = signed_up("alice@example.test")
    browser = new_client()
    browser.cookies.set(SESSION_COOKIE, _forge(alice["id"], **overrides), path="/api")
    _error(browser.get("/api/auth/me"), 401, "invalid_session")


def test_garbage_cookie_and_deleted_user_are_refused(signed_up, engine):
    browser, alice = signed_up("alice@example.test")
    junk = new_client()
    junk.cookies.set(SESSION_COOKIE, "garbage", path="/api")
    _error(junk.get("/api/auth/me"), 401, "invalid_session")

    ghost = new_client()
    ghost.cookies.set(SESSION_COOKIE, _forge(uuid.uuid4()), path="/api")
    _error(ghost.get("/api/auth/me"), 401, "invalid_session")

    with engine.begin() as conn:
        conn.execute(text("delete from users where id = :id"), {"id": alice["id"]})
    _error(browser.get("/api/auth/me"), 401, "invalid_session")


def test_bumping_token_version_signs_out_everywhere(signed_up, engine):
    browser, _ = signed_up("alice@example.test")
    with engine.begin() as conn:
        conn.execute(text("update users set token_version = token_version + 1"))
    _error(browser.get("/api/auth/me"), 401, "invalid_session")


def test_missing_secret_is_a_safe_503(client, monkeypatch):
    from app.routers import auth as auth_router

    monkeypatch.setattr(
        auth_router, "get_settings", lambda: Settings(APP_SECRET_KEY="", _env_file=None)
    )
    r = client.post(
        "/api/auth/signup", json={"email": "alice@example.test", "password": PASSWORD}
    )
    _error(r, 503, "service_unavailable")


# --- Cross-site request protection ---


def test_change_requests_need_our_header_and_origin(engine):
    from fastapi.testclient import TestClient

    from app.main import app

    bare = TestClient(app)
    payload = {"email": "alice@example.test", "password": PASSWORD}
    _error(bare.post("/api/auth/signup", json=payload), 403, "csrf_check_failed")

    foreign = new_client()
    r = foreign.post(
        "/api/auth/signup", json=payload, headers={"Origin": "https://evil.example"}
    )
    _error(r, 403, "csrf_check_failed")

    ok = new_client().post(
        "/api/auth/signup", json=payload, headers={"Origin": "http://localhost:5173"}
    )
    assert ok.status_code == 201
    assert bare.get("/api/health").status_code == 200  # reads need no header


# --- Isolation between users (groundwork for A04) ---


def test_alice_and_bob_only_see_their_own_categories(signed_up):
    alice_browser, _ = signed_up("alice@example.test")
    bob_browser, _ = signed_up("bob@example.test")
    alice_ids = {c["id"] for c in alice_browser.get("/api/categories").json()["data"]}
    bob_ids = {c["id"] for c in bob_browser.get("/api/categories").json()["data"]}
    assert len(alice_ids) == len(bob_ids) == TOTAL_DEFAULTS
    assert alice_ids.isdisjoint(bob_ids)
