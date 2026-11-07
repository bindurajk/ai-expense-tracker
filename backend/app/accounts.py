"""Account setup (A01): profile + default categories, created once per verified user."""

import uuid

from sqlalchemy import Connection, text

# PRD feature C01. "Other" exists in both lists as two separate categories.
DEFAULT_EXPENSE_CATEGORIES = (
    "Housing",
    "Groceries",
    "Eating out",
    "Transport",
    "Utilities",
    "Shopping",
    "Health",
    "Entertainment",
    "Other",
)
DEFAULT_INCOME_CATEGORIES = ("Salary", "Freelance", "Benefits", "Other")

_PROFILE_COLUMNS = "id, locale, currency, timezone, onboarding_completed_at"
_CATEGORY_COLUMNS = "id, name, category_type, archived_at"


def initialise_account(
    conn: Connection, user_id: uuid.UUID
) -> tuple[bool, dict, list[dict]]:
    """Create the profile and default categories if they don't exist yet.

    Safe to call any number of times, including at the same moment from two tabs:
    the profile insert is the single gate. Only the call that actually creates the
    profile adds the categories, and both happen in the caller's transaction.
    Existing categories are never reset or renamed.
    """
    created = (
        conn.execute(
            text(
                "insert into profiles (id) values (:id) on conflict (id) do nothing returning id"
            ),
            {"id": user_id},
        ).first()
        is not None
    )

    if created:
        rows = [
            {"user_id": user_id, "name": n, "type": "expense"}
            for n in DEFAULT_EXPENSE_CATEGORIES
        ]
        rows += [
            {"user_id": user_id, "name": n, "type": "income"}
            for n in DEFAULT_INCOME_CATEGORIES
        ]
        conn.execute(
            text(
                "insert into categories (user_id, name, category_type) "
                "values (:user_id, :name, :type) on conflict do nothing"
            ),
            rows,
        )

    profile = get_profile(conn, user_id)
    assert profile is not None  # just inserted or already present
    return created, profile, list_categories(conn, user_id)


def get_profile(conn: Connection, user_id: uuid.UUID) -> dict | None:
    row = conn.execute(
        text(f"select {_PROFILE_COLUMNS} from profiles where id = :id"), {"id": user_id}
    ).first()
    return dict(row._mapping) if row else None


def list_categories(
    conn: Connection, user_id: uuid.UUID, include_archived: bool = True
) -> list[dict]:
    archived_filter = "" if include_archived else " and archived_at is null"
    rows = conn.execute(
        text(
            f"select {_CATEGORY_COLUMNS} from categories where user_id = :user_id{archived_filter} "
            # Expense first, then income; "Other" last within each type.
            "order by category_type, lower(name) = 'other', lower(name)"
        ),
        {"user_id": user_id},
    )
    return [dict(r._mapping) for r in rows]
