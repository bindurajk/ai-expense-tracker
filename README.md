# SpendWise

A personal budgeting web app: record what you earn and spend, set monthly limits, and see a clear summary.
Manual entry only, GBP only, UK dates. Built feature by feature from the PRD; progress is tracked in `SpendWise-Tracker.xlsx`.

| Folder | What it is |
|---|---|
| `frontend/` | React + TypeScript app (Vite) |
| `backend/` | FastAPI (Python 3.12) API |

## First-time setup (Windows)

You need Node.js and Python 3.12 (both free). Then, from this folder in PowerShell:

```powershell
cd frontend
npm install
cd ..\backend
py -3.12 -m venv .venv   # or the full path to python.exe if "py" is not available
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
```

If PowerShell blocks `Activate.ps1`, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.

## Settings

Only the backend needs settings: copy `backend/.env.example` to `backend/.env` and follow
[docs/supabase-setup.md](docs/supabase-setup.md) (Supabase is used as the database only).
Then create the tables: `cd backend; .\.venv\Scripts\alembic.exe upgrade head`.
Never commit `.env`; it is git-ignored. If the backend isn't running or configured, private pages show
"The app is not set up yet".

**Accounts:** SpendWise has its own email + password sign-in. Passwords are stored only as Argon2 hashes, the
session is an HttpOnly cookie, and there are no verification emails.

## Running the app

Open two terminals:

```powershell
# Terminal 1 — backend on http://localhost:8000
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```

```powershell
# Terminal 2 — frontend on http://localhost:5173
cd frontend
npm.cmd run dev   # "npm.cmd" avoids PowerShell's script-blocking setting
```

Open http://localhost:5173. In development, the Sign in page has a **Preview the app layout** button that opens an
empty demo account (nothing is saved). It does not exist in production builds.

## Tests

```powershell
cd frontend; npm test        # React tests
cd backend; pytest           # API tests (with the venv activated)
```
