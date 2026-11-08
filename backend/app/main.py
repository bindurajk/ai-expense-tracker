from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.errors import AppError, error_response, install_error_handling
from app.routers import account, auth, transactions

ALLOWED_ORIGINS = ["http://localhost:5173"]
UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

app = FastAPI(title="SpendWise API")


@app.middleware("http")
async def csrf_guard(request: Request, call_next):
    """Blocks cross-site form posts that would ride on the session cookie.

    Every change request must carry our custom header (a plain HTML form or another
    website cannot add it) and, when the browser says where it came from, a known origin.
    """
    if request.method in UNSAFE_METHODS and request.url.path.startswith("/api/"):
        origin = request.headers.get("origin")
        if request.headers.get("x-requested-with") != "SpendWise" or (
            origin and origin not in ALLOWED_ORIGINS
        ):
            # Middleware can't use the exception handlers, so answer directly.
            return error_response(
                request,
                AppError(
                    403,
                    "csrf_check_failed",
                    "This request was blocked for your safety.",
                ),
            )
    return await call_next(request)


# Registered after the CSRF guard so its errors also get the standard format and request ID.
install_error_handling(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Idempotency-Key", "X-Requested-With"],
)

app.include_router(auth.router)
app.include_router(account.router)
app.include_router(transactions.router)


@app.get("/api/health")
def health() -> dict:
    return {"data": {"status": "ok"}}
