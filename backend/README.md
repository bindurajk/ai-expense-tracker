# SpendWise backend

FastAPI + PostgreSQL (Supabase). Money is stored as integer pence.

All commands below are for **Windows PowerShell**, run from this `backend` folder:

```powershell
cd "C:\Users\bbrra\OneDrive\Documents\Shivanshu AI\AI Projects\SpendWise\backend"
```

## 1. Activate the virtual environment

```powershell
.\.venv\Scripts\Activate.ps1
```

If PowerShell says running scripts is disabled, run this once, then try again:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Your prompt now starts with `(.venv)`. Type `deactivate` to leave it.

If `.venv` does not exist yet, create it first:

```powershell
& "C:\Users\bbrra\AppData\Local\Programs\Python\Python312\python.exe" -m venv .venv
```

## 2. Install dependencies

```powershell
python -m pip install -r requirements-dev.txt
```

(`requirements.txt` = what the app needs to run; `requirements-dev.txt` adds test/lint tools.)

## 3. Settings

```powershell
Copy-Item .env.example .env
```

Fill in real values in `.env`. **Never commit `.env`** — it holds secrets. The app
still starts with empty values (there is no database connection yet).

## 4. Run the API

```powershell
uvicorn app.main:app --reload --port 8000
```

Check it: open http://localhost:8000/api/health (should show `{"data":{"status":"ok"}}`).
Interactive docs: http://localhost:8000/docs. Press `Ctrl+C` to stop.

## 5. Test and lint

```powershell
pytest
ruff check .
ruff format .
```

## Database migrations (later)

Alembic is set up in `migrations/` and reads `DATABASE_URL` from `.env`
(not from `alembic.ini`). Once a database and models exist:

```powershell
alembic revision --autogenerate -m "describe change"
alembic upgrade head
```
