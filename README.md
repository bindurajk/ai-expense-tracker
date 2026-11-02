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

- Copy `frontend/.env.example` to `frontend/.env.local`.
- Copy `backend/.env.example` to `backend/.env`.

Fill in the values when you reach the sign-up feature (A01). Never commit `.env` or `.env.local`; they are git-ignored.
Until the settings are filled in, private pages show a "The app is not set up yet" message. That is expected.

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
npm run dev
```

Open http://localhost:5173. In development, the Sign in page has a **Preview the app layout** button that opens an
empty demo account (nothing is saved). It does not exist in production builds.

## Tests

```powershell
cd frontend; npm test        # React tests
cd backend; pytest           # API tests (with the venv activated)
```
