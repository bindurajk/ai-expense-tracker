"""Password hashing and session tokens.

Passwords: Argon2id (the current recommended algorithm). We store only the hash.
Sessions: a signed token in an HttpOnly cookie, so page scripts can never read it.
"""

import threading
import time
import uuid
from collections import defaultdict, deque

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.config import Settings
from app.errors import AppError, invalid_session, service_unavailable

SESSION_COOKIE = "sw_session"
_MIN_SECRET_LENGTH = 32

_hasher = PasswordHasher()
# Used when an email is unknown, so a failed sign-in takes about as long either way
# and timing doesn't reveal which emails have accounts.
_DUMMY_HASH = _hasher.hash("not-a-real-password-just-for-timing")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    try:
        return (
            _hasher.verify(password_hash or _DUMMY_HASH, password)
            and password_hash is not None
        )
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


def _secret(settings: Settings) -> str:
    if len(settings.APP_SECRET_KEY) < _MIN_SECRET_LENGTH:
        raise service_unavailable("Sign-in is not configured yet.")
    return settings.APP_SECRET_KEY


def create_session_token(
    user_id: uuid.UUID, token_version: int, settings: Settings
) -> str:
    now = int(time.time())
    claims = {
        "sub": str(user_id),
        "ver": token_version,
        "typ": "session",
        "iat": now,
        "exp": now + settings.SESSION_DAYS * 86400,
    }
    return jwt.encode(claims, _secret(settings), algorithm="HS256")


def decode_session_token(token: str, settings: Settings) -> tuple[uuid.UUID, int]:
    secret = _secret(settings)
    try:
        claims = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            options={"require": ["exp", "sub", "ver"]},
        )
        if claims.get("typ") != "session":
            raise invalid_session()
        return uuid.UUID(str(claims["sub"])), int(claims["ver"])
    except (jwt.PyJWTError, ValueError, TypeError) as exc:
        raise invalid_session() from exc


class AttemptLimiter:
    """Small in-memory limiter: at most `limit` events per key within `window` seconds.

    Good enough for one server process. A multi-server deployment would need a shared store.
    """

    def __init__(self, limit: int, window: float):
        self.limit = limit
        self.window = window
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _prune(self, key: str, now: float) -> deque[float]:
        events = self._events[key]
        while events and now - events[0] > self.window:
            events.popleft()
        return events

    def check(self, key: str) -> None:
        with self._lock:
            events = self._prune(key, time.monotonic())
            if len(events) >= self.limit:
                retry = int(self.window - (time.monotonic() - events[0])) + 1
                raise AppError(
                    429,
                    "rate_limited",
                    "Too many attempts. Please wait a few minutes and try again.",
                    headers={"Retry-After": str(max(retry, 1))},
                )

    def record(self, key: str) -> None:
        with self._lock:
            self._prune(key, time.monotonic()).append(time.monotonic())

    def clear(self, key: str | None = None) -> None:
        with self._lock:
            if key is None:
                self._events.clear()
            else:
                self._events.pop(key, None)


# Failed sign-ins: 10 per email+IP and 50 per IP per 15 minutes. Sign-ups: 20 per IP per hour.
failed_login_limiter = AttemptLimiter(limit=10, window=15 * 60)
failed_login_ip_limiter = AttemptLimiter(limit=50, window=15 * 60)
signup_limiter = AttemptLimiter(limit=20, window=60 * 60)
