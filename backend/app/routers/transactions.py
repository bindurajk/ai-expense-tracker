"""Add an entry (T01 expense, T02 income) and list recent entries."""

import uuid
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Header, Query, Response
from pydantic import BaseModel, ConfigDict, field_validator

from app import transactions
from app.auth import ConnDep, CurrentUserDep
from app.errors import AppError

router = APIRouter(prefix="/api")


class NewTransaction(BaseModel):
    # No user_id here on purpose: the owner always comes from the session cookie.
    model_config = ConfigDict(extra="forbid")

    transaction_type: Literal["expense", "income"]
    amount_pence: int
    category_id: uuid.UUID
    occurred_on: date
    note: str | None = None

    @field_validator("amount_pence", mode="before")
    @classmethod
    def check_amount(cls, v: object) -> int:
        # Whole pence only: reject floats ("12.5"), strings and true/false.
        if isinstance(v, bool) or not isinstance(v, int):
            raise ValueError("Enter the amount in whole pence")
        if not 1 <= v <= transactions.MAX_AMOUNT_PENCE:
            raise ValueError("Enter an amount between £0.01 and £999,999.99")
        return v

    @field_validator("occurred_on")
    @classmethod
    def check_date(cls, v: date) -> date:
        if v < transactions.EARLIEST_DATE:
            raise ValueError("Enter a date from 2000 onwards")
        if v > transactions.today_in_london():
            raise ValueError("The date can't be in the future")
        return v

    @field_validator("note")
    @classmethod
    def check_note(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if len(v) > transactions.NOTE_MAX_LENGTH:
            raise ValueError(f"Keep the note to {transactions.NOTE_MAX_LENGTH} characters or fewer")
        return v or None


def _parse_key(raw: str | None) -> uuid.UUID | None:
    if raw is None:
        return None
    try:
        return uuid.UUID(raw)
    except ValueError:
        raise AppError(
            422, "validation_failed", "Some fields need attention.",
            {"Idempotency-Key": "Must be a UUID"},
        ) from None


@router.post("/transactions", status_code=201)
def add_transaction(
    body: NewTransaction,
    response: Response,
    user: CurrentUserDep,
    conn: ConnDep,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> dict:
    created, txn = transactions.create_transaction(
        conn,
        user.id,
        kind=body.transaction_type,
        amount_pence=body.amount_pence,
        category_id=body.category_id,
        occurred_on=body.occurred_on,
        note=body.note,
        idempotency_key=_parse_key(idempotency_key),
    )
    if not created:
        response.status_code = 200  # a safe retry: nothing new was saved
    return {"data": txn}


@router.get("/transactions/recent")
def recent_transactions(
    user: CurrentUserDep,
    conn: ConnDep,
    limit: Annotated[int, Query(ge=1, le=25)] = 5,
) -> dict:
    return {"data": transactions.list_recent(conn, user.id, limit)}
