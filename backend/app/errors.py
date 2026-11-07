"""One error format for every API response (PRD section 8).

Success: {"data": ...}
Failure: {"error": {"code", "message", "field_errors"?, "request_id"}}
User-facing errors never include stack traces, SQL, tokens or provider responses.
"""

import logging
import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("spendwise")


class AppError(Exception):
    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        field_errors: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
    ):
        super().__init__(code)
        self.status = status
        self.code = code
        self.message = message
        self.field_errors = field_errors
        self.headers = headers


def invalid_session() -> AppError:
    return AppError(
        401,
        "invalid_session",
        "Your session is not valid. Please sign in again.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def service_unavailable(
    message: str = "This service is temporarily unavailable.",
) -> AppError:
    return AppError(503, "service_unavailable", message)


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "unknown")


def _error_response(request: Request, err: AppError) -> JSONResponse:
    body: dict = {
        "code": err.code,
        "message": err.message,
        "request_id": _request_id(request),
    }
    if err.field_errors:
        body["field_errors"] = err.field_errors
    return JSONResponse({"error": body}, status_code=err.status, headers=err.headers)


_STATUS_CODES = {
    400: ("bad_request", "The request was not understood."),
    401: ("invalid_session", "Your session is not valid. Please sign in again."),
    403: ("forbidden", "You can't do that."),
    404: ("not_found", "Not found."),
    405: ("method_not_allowed", "That action is not allowed here."),
}


def install_error_handling(app: FastAPI) -> None:
    @app.middleware("http")
    async def request_id_and_no_store(request: Request, call_next):
        request.state.request_id = str(uuid.uuid4())
        response = await call_next(request)
        response.headers["X-Request-ID"] = request.state.request_id
        if request.url.path.startswith("/api/"):
            # Financial responses must never be cached by browsers or proxies.
            response.headers["Cache-Control"] = "no-store, private"
        return response

    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError):
        return _error_response(request, exc)

    @app.exception_handler(RequestValidationError)
    async def handle_validation(request: Request, exc: RequestValidationError):
        fields = {
            ".".join(str(p) for p in e["loc"] if p not in ("body", "query", "path")): e[
                "msg"
            ]
            for e in exc.errors()
        }
        return _error_response(
            request,
            AppError(422, "validation_failed", "Some fields need attention.", fields),
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http(request: Request, exc: StarletteHTTPException):
        code, message = _STATUS_CODES.get(exc.status_code, ("error", "Request failed."))
        return _error_response(request, AppError(exc.status_code, code, message))

    @app.exception_handler(Exception)
    async def handle_unexpected(request: Request, exc: Exception):
        # Log the type only: exception text can contain SQL or personal data.
        logger.error(
            "unhandled error %s request_id=%s", type(exc).__name__, _request_id(request)
        )
        return _error_response(
            request,
            AppError(500, "internal_error", "Something went wrong. Please try again."),
        )
