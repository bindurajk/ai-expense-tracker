"""Sign up, sign in, sign out and "who am I" (own email + password accounts)."""

import re

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, field_validator
from sqlalchemy import text

from app import accounts
from app.auth import ConnDep, CurrentUserDep
from app.config import get_settings
from app.errors import AppError
from app.security import (
    SESSION_COOKIE,
    create_session_token,
    failed_login_ip_limiter,
    failed_login_limiter,
    hash_password,
    needs_rehash,
    signup_limiter,
    verify_password,
)

router = APIRouter(prefix="/api/auth")

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _normalise_email(value: str) -> str:
    email = value.strip().lower()
    if len(email) > 254 or not _EMAIL_RE.match(email):
        raise ValueError("Enter a valid email address, like name@gmail.com")
    return email


class SignupBody(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def check_email(cls, v: str) -> str:
        return _normalise_email(v)

    @field_validator("password")
    @classmethod
    def check_password(cls, v: str) -> str:
        if not 8 <= len(v) <= 128:
            raise ValueError("Your password must be 8 to 128 characters")
        return v


class LoginBody(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def check_email(cls, v: str) -> str:
        return _normalise_email(v)

    @field_validator("password")
    @classmethod
    def check_password(cls, v: str) -> str:
        if not 1 <= len(v) <= 128:
            raise ValueError("Enter your password")
        return v


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _set_session_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=settings.SESSION_DAYS * 86400,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="strict",
        path="/api",
    )


def _user_payload(user_id, email: str) -> dict:
    return {"data": {"user": {"id": user_id, "email": email}}}


@router.post("/signup", status_code=201)
def signup(
    body: SignupBody, request: Request, response: Response, conn: ConnDep
) -> dict:
    ip_key = f"ip:{_client_ip(request)}"
    signup_limiter.check(ip_key)
    signup_limiter.record(ip_key)

    password_hash = hash_password(body.password)
    row = conn.execute(
        text(
            "insert into users (email, password_hash) values (:email, :hash) "
            "on conflict (email) do nothing returning id, token_version"
        ),
        {"email": body.email, "hash": password_hash},
    ).first()
    if row is None:
        raise AppError(
            409,
            "account_exists",
            "An account with this email already exists. Try signing in.",
        )

    # Profile and starter categories are created in the same transaction as the user.
    accounts.initialise_account(conn, row.id)
    _set_session_cookie(
        response, create_session_token(row.id, row.token_version, get_settings())
    )
    return _user_payload(row.id, body.email)


@router.post("/login")
def login(body: LoginBody, request: Request, response: Response, conn: ConnDep) -> dict:
    ip = _client_ip(request)
    key = f"{ip}:{body.email}"
    failed_login_limiter.check(key)
    failed_login_ip_limiter.check(ip)

    row = conn.execute(
        text("select id, password_hash, token_version from users where email = :email"),
        {"email": body.email},
    ).first()

    if not verify_password(row.password_hash if row else None, body.password):
        failed_login_limiter.record(key)
        failed_login_ip_limiter.record(ip)
        # Same answer whether the email is unknown or the password is wrong.
        raise AppError(401, "invalid_credentials", "Email or password is incorrect.")

    failed_login_limiter.clear(key)
    updates = {"id": row.id}
    rehash_sql = ""
    if needs_rehash(row.password_hash):
        rehash_sql = ", password_hash = :hash"
        updates["hash"] = hash_password(body.password)
    conn.execute(
        text(f"update users set last_login_at = now(){rehash_sql} where id = :id"),
        updates,
    )

    _set_session_cookie(
        response, create_session_token(row.id, row.token_version, get_settings())
    )
    return _user_payload(row.id, body.email)


@router.post("/logout", status_code=204)
def logout(response: Response) -> Response:
    settings = get_settings()
    response.delete_cookie(
        SESSION_COOKIE,
        path="/api",
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="strict",
    )
    response.status_code = 204
    return response


@router.get("/me")
def me(user: CurrentUserDep) -> dict:
    return _user_payload(user.id, user.email)
