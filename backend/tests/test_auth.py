"""Who may call private endpoints (A01 + groundwork for A02/A04)."""

import time
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

from app import auth
from app.config import Settings
from tests.conftest import TEST_SUPABASE_URL, auth_header, make_token

PRIVATE_ENDPOINTS = [
    ("post", "/api/account/initialise"),
    ("get", "/api/profile"),
    ("get", "/api/categories"),
]


def _call(client, method, path, headers=None):
    return getattr(client, method)(path, headers=headers or {})


def _assert_error(response, status, code):
    assert response.status_code == status, response.text
    body = response.json()
    assert body["error"]["code"] == code
    assert body["error"]["request_id"]
    assert response.headers["cache-control"] == "no-store, private"


@pytest.mark.parametrize("method,path", PRIVATE_ENDPOINTS)
def test_anonymous_is_refused(client, method, path):
    _assert_error(_call(client, method, path), 401, "invalid_session")


@pytest.mark.parametrize(
    "token_kwargs",
    [
        {"secret": "wrong-secret-wrong-secret-wrong-secret-00"},
        {"exp": int(time.time()) - 3600},
        {"aud": "someone-else"},
        {"iss": "https://attacker.example/auth/v1"},
        {"role": "anon"},
        {"sub": "not-a-uuid"},
        {"exp": None},
    ],
    ids=[
        "bad-signature",
        "expired",
        "wrong-audience",
        "wrong-issuer",
        "anon-role",
        "bad-sub",
        "no-exp",
    ],
)
def test_bad_tokens_are_refused(client, make_user, token_kwargs):
    user = make_user()
    headers = auth_header(user, **token_kwargs)
    _assert_error(
        client.post("/api/account/initialise", headers=headers), 401, "invalid_session"
    )


def test_garbage_and_unsigned_tokens_are_refused(client, make_user):
    user = make_user()
    unsigned = jwt.encode(
        {
            "sub": str(user),
            "aud": "authenticated",
            "role": "authenticated",
            "exp": int(time.time()) + 60,
        },
        key=None,
        algorithm="none",
    )
    for token in ["garbage", unsigned]:
        r = client.get("/api/profile", headers={"Authorization": f"Bearer {token}"})
        _assert_error(r, 401, "invalid_session")


def test_deleted_missing_and_banned_users_are_refused(client, make_user):
    import uuid

    deleted = make_user(deleted_at=datetime.now(UTC))
    banned = make_user(banned_until=datetime.now(UTC) + timedelta(days=1))
    never_existed = uuid.uuid4()
    for user in (deleted, banned, never_existed):
        _assert_error(
            client.get("/api/profile", headers=auth_header(user)),
            401,
            "invalid_session",
        )


@pytest.mark.parametrize("method,path", PRIVATE_ENDPOINTS)
def test_unverified_email_cannot_reach_finance_data(
    client, make_user, engine, method, path
):
    user = make_user(confirmed=False)
    _assert_error(
        _call(client, method, path, auth_header(user)), 403, "email_not_verified"
    )


def test_unverified_user_initialise_creates_nothing(client, make_user, engine):
    from sqlalchemy import text

    user = make_user(confirmed=False)
    client.post("/api/account/initialise", headers=auth_header(user))
    with engine.connect() as conn:
        assert conn.execute(text("select count(*) from profiles")).scalar() == 0
        assert conn.execute(text("select count(*) from categories")).scalar() == 0


def test_es256_tokens_verified_with_published_keys(client, make_user, monkeypatch):
    """New Supabase projects sign tokens with asymmetric keys published as JWKS."""
    user = make_user()
    private_key = ec.generate_private_key(ec.SECP256R1())

    class FakeJwks:
        def get_signing_key_from_jwt(self, token):
            return type("Key", (), {"key": private_key.public_key()})()

    monkeypatch.setattr(auth, "_jwks_client", lambda url: FakeJwks())
    now = int(time.time())
    claims = {
        "sub": str(user),
        "aud": "authenticated",
        "role": "authenticated",
        "iss": f"{TEST_SUPABASE_URL}/auth/v1",
        "exp": now + 600,
    }
    good = jwt.encode(claims, private_key, algorithm="ES256", headers={"kid": "k1"})
    assert (
        client.post(
            "/api/account/initialise", headers={"Authorization": f"Bearer {good}"}
        ).status_code
        == 200
    )

    other_key = ec.generate_private_key(ec.SECP256R1())
    forged = jwt.encode(claims, other_key, algorithm="ES256", headers={"kid": "k1"})
    r = client.get("/api/profile", headers={"Authorization": f"Bearer {forged}"})
    _assert_error(r, 401, "invalid_session")


def test_missing_auth_configuration_is_a_safe_503(client, make_user, monkeypatch):
    user = make_user()
    token = make_token(user)
    monkeypatch.setattr(
        auth,
        "get_settings",
        lambda: Settings(SUPABASE_URL="", SUPABASE_JWT_SECRET="", _env_file=None),
    )
    r = client.get("/api/profile", headers={"Authorization": f"Bearer {token}"})
    _assert_error(r, 503, "service_unavailable")
    assert "secret" not in r.text.lower()
