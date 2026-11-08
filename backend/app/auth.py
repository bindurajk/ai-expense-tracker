"""Who is calling the API, checked on every private request.

The browser holds a signed session token in an HttpOnly cookie. We verify its signature
and expiry, then look the user up, so deleted users (or sessions ended by bumping
token_version) are refused even while an old cookie is still unexpired.
The user ID always comes from the verified cookie, never from the request body.
"""

import uuid
from dataclasses import dataclass
from typing import Annotated

from fastapi import Cookie, Depends
from sqlalchemy import Connection, text

from app.config import get_settings
from app.db import get_conn
from app.errors import invalid_session
from app.security import SESSION_COOKIE, decode_session_token


@dataclass(frozen=True)
class CurrentUser:
    id: uuid.UUID
    email: str


def get_current_user(
    conn: Annotated[Connection, Depends(get_conn)],
    session: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
) -> CurrentUser:
    if not session:
        raise invalid_session()

    user_id, token_version = decode_session_token(session, get_settings())
    row = conn.execute(
        text("select email, token_version from users where id = :id"), {"id": user_id}
    ).first()
    if row is None or row.token_version != token_version:
        raise invalid_session()
    return CurrentUser(id=user_id, email=row.email)


CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]
ConnDep = Annotated[Connection, Depends(get_conn)]
