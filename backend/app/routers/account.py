from fastapi import APIRouter

from app import accounts
from app.auth import ConnDep, CurrentUserDep
from app.errors import AppError

router = APIRouter(prefix="/api")


@router.post("/account/initialise")
def initialise(user: CurrentUserDep, conn: ConnDep) -> dict:
    """Called by the browser after a verified sign-in. Safe to retry."""
    created, profile, categories = accounts.initialise_account(conn, user.id)
    return {"data": {"created": created, "profile": profile, "categories": categories}}


@router.get("/profile")
def read_profile(user: CurrentUserDep, conn: ConnDep) -> dict:
    profile = accounts.get_profile(conn, user.id)
    if profile is None:
        raise AppError(
            404, "profile_not_initialised", "Your account is not set up yet."
        )
    return {"data": profile}


@router.get("/categories")
def read_categories(
    user: CurrentUserDep, conn: ConnDep, include_archived: bool = False
) -> dict:
    return {"data": accounts.list_categories(conn, user.id, include_archived)}
