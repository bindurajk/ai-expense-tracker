"""Recording money (T01 expenses, T02 income).

Amounts are whole pence (integers) everywhere, never floats.
Every query is filtered by the signed-in user's ID, which comes from the session cookie.
"""

import uuid
from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import Connection, text

from app.errors import AppError

LONDON = ZoneInfo("Europe/London")
MAX_AMOUNT_PENCE = 99_999_999  # £999,999.99
EARLIEST_DATE = date(2000, 1, 1)
NOTE_MAX_LENGTH = 140

_COLUMNS = (
    "t.id, t.transaction_type, t.amount_pence, t.occurred_on, t.note, t.version, "
    "t.created_at, t.category_id, c.name as category_name"
)


def today_in_london() -> date:
    return datetime.now(LONDON).date()


def _fetch_one(conn: Connection, user_id: uuid.UUID, where: str, params: dict) -> dict | None:
    row = conn.execute(
        text(
            f"select {_COLUMNS} from transactions t "
            "join categories c on c.id = t.category_id "
            f"where t.user_id = :user_id and {where}"
        ),
        {"user_id": user_id, **params},
    ).first()
    return dict(row._mapping) if row else None


def _check_category(conn: Connection, user_id: uuid.UUID, category_id: uuid.UUID, kind: str) -> None:
    row = conn.execute(
        text(
            "select category_type, archived_at from categories "
            "where id = :id and user_id = :user_id"
        ),
        {"id": category_id, "user_id": user_id},
    ).first()
    # Someone else's category looks exactly like a missing one: never reveal it exists.
    if row is None:
        raise AppError(422, "validation_failed", "Some fields need attention.",
                       {"category_id": "Choose a category"})
    if row.category_type != kind:
        raise AppError(422, "validation_failed", "Some fields need attention.",
                       {"category_id": f"Choose an {kind} category"})
    if row.archived_at is not None:
        raise AppError(422, "validation_failed", "Some fields need attention.",
                       {"category_id": "That category is archived. Choose another one"})


def create_transaction(
    conn: Connection,
    user_id: uuid.UUID,
    *,
    kind: str,
    amount_pence: int,
    category_id: uuid.UUID,
    occurred_on: date,
    note: str | None,
    idempotency_key: uuid.UUID | None,
) -> tuple[bool, dict]:
    """Save one entry. Returns (created, transaction).

    With an idempotency key, sending the same request again (a retry after a dropped
    connection, a double tap) returns the first transaction instead of saving a second one.
    Reusing a key for a different entry is refused.
    """
    values = {
        "transaction_type": kind,
        "amount_pence": amount_pence,
        "category_id": category_id,
        "occurred_on": occurred_on,
        "note": note,
    }

    if idempotency_key is not None:
        existing = _replay(conn, user_id, idempotency_key, values)
        if existing is not None:
            return False, existing

    _check_category(conn, user_id, category_id, kind)

    new_id = conn.execute(
        text(
            "insert into transactions "
            "(user_id, category_id, transaction_type, amount_pence, occurred_on, note, idempotency_key) "
            "values (:user_id, :category_id, :transaction_type, :amount_pence, :occurred_on, :note, :key) "
            "on conflict (user_id, idempotency_key) do nothing returning id"
        ),
        {"user_id": user_id, "key": idempotency_key, **values},
    ).scalar()

    if new_id is None:
        # Another request with the same key won the race a moment ago.
        existing = _replay(conn, user_id, idempotency_key, values)
        assert existing is not None
        return False, existing

    # Totals and insights cached for this user are now out of date (used by D01/I04).
    conn.execute(
        text("update profiles set finance_revision = finance_revision + 1 where id = :id"),
        {"id": user_id},
    )
    created = _fetch_one(conn, user_id, "t.id = :id", {"id": new_id})
    assert created is not None
    return True, created


def _replay(conn: Connection, user_id: uuid.UUID, key: uuid.UUID, values: dict) -> dict | None:
    existing = _fetch_one(conn, user_id, "t.idempotency_key = :key", {"key": key})
    if existing is None:
        return None
    if any(existing[k] != v for k, v in values.items()):
        raise AppError(
            409,
            "idempotency_conflict",
            "This request was already used for a different entry. Please try again.",
        )
    return existing


def list_recent(conn: Connection, user_id: uuid.UUID, limit: int) -> list[dict]:
    rows = conn.execute(
        text(
            f"select {_COLUMNS} from transactions t "
            "join categories c on c.id = t.category_id "
            "where t.user_id = :user_id "
            "order by t.occurred_on desc, t.created_at desc limit :limit"
        ),
        {"user_id": user_id, "limit": limit},
    )
    return [dict(r._mapping) for r in rows]
