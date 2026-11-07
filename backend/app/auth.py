"""Checks who is calling the API, on every private request.

The browser signs in with Supabase Auth and sends its access token as
"Authorization: Bearer <token>". Here we:
1. verify the token's signature, expiry, audience and issuer;
2. look the user up in Supabase's auth.users table, so deleted or banned
   users are refused even while an old token is still unexpired;
3. refuse anyone whose email address is not confirmed yet.

The user ID always comes from the verified token, never from the request body.
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from functools import lru_cache
from typing import Annotated

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import Connection, text

from app.config import Settings, get_settings
from app.db import get_conn
from app.errors import AppError, invalid_session, service_unavailable

_bearer = HTTPBearer(auto_error=False)

# Supabase projects sign tokens either with asymmetric "JWT signing keys" (published as JWKS)
# or, on older projects, with a shared HS256 secret. Both are supported.
_ASYMMETRIC_ALGS = {"ES256", "RS256"}


@dataclass(frozen=True)
class CurrentUser:
    id: uuid.UUID
    email: str | None


@lru_cache
def _jwks_client(supabase_url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(
        f"{supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json",
        cache_keys=True,
        lifespan=600,
        timeout=5,
    )


def decode_access_token(token: str, settings: Settings) -> dict:
    if not settings.SUPABASE_URL and not settings.SUPABASE_JWT_SECRET:
        raise service_unavailable("Sign-in is not configured yet.")

    try:
        alg = jwt.get_unverified_header(token).get("alg")
    except jwt.PyJWTError as exc:
        raise invalid_session() from exc

    if alg == "HS256":
        if not settings.SUPABASE_JWT_SECRET:
            raise invalid_session()
        key = settings.SUPABASE_JWT_SECRET
    elif alg in _ASYMMETRIC_ALGS:
        if not settings.SUPABASE_URL:
            raise invalid_session()
        try:
            key = (
                _jwks_client(settings.SUPABASE_URL).get_signing_key_from_jwt(token).key
            )
        except jwt.PyJWKClientConnectionError as exc:
            raise service_unavailable(
                "Sign-in checks are unavailable right now."
            ) from exc
        except jwt.PyJWTError as exc:
            raise invalid_session() from exc
    else:
        # Includes "none" and anything unexpected.
        raise invalid_session()

    issuer = (
        f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1"
        if settings.SUPABASE_URL
        else None
    )
    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=[alg],
            audience="authenticated",
            issuer=issuer,
            leeway=30,
            options={"require": ["exp", "sub", "aud"]},
        )
    except jwt.PyJWTError as exc:
        raise invalid_session() from exc

    if claims.get("role") != "authenticated":
        raise invalid_session()
    return claims


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> CurrentUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise invalid_session()

    claims = decode_access_token(credentials.credentials, get_settings())
    try:
        user_id = uuid.UUID(str(claims["sub"]))
    except ValueError as exc:
        raise invalid_session() from exc

    row = conn.execute(
        text(
            "select email, email_confirmed_at, banned_until, deleted_at "
            "from auth.users where id = :id"
        ),
        {"id": user_id},
    ).first()

    if row is None or row.deleted_at is not None:
        raise invalid_session()
    if row.banned_until is not None and row.banned_until > datetime.now(UTC):
        raise invalid_session()
    if row.email_confirmed_at is None:
        raise AppError(
            403,
            "email_not_verified",
            "Please confirm your email address first. Check your inbox for the link.",
        )
    return CurrentUser(id=user_id, email=row.email)


CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]
ConnDep = Annotated[Connection, Depends(get_conn)]
