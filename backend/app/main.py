from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.errors import install_error_handling
from app.routers import account

app = FastAPI(title="SpendWise API")

install_error_handling(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
)

app.include_router(account.router)


@app.get("/api/health")
def health() -> dict:
    return {"data": {"status": "ok"}}
