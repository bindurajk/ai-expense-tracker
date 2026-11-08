# Setting up Supabase (free) as the database

SpendWise uses Supabase **only as its PostgreSQL database**. Sign-up and sign-in are handled by
SpendWise's own backend (email + password, no verification emails), so no Supabase Auth settings
are needed.

> **Never paste keys, passwords or connection strings into a chat or AI prompt.** Type them only into `backend/.env`.

## 1. Create the project

1. Go to <https://supabase.com> → sign up (free, no card).
2. **New project** → choose a name, region close to you, Free plan.
3. **Database password:** generate one with **letters and numbers only** (symbols such as `@ # / ? %`
   break the connection address). Save it in your password manager.

## 2. Backend settings

1. Dashboard → **Connect** (top bar) → **Connection string** → **Session pooler** → copy the address.
   Use the *Session pooler*, not *Direct connection*: the direct one needs IPv6, which many home
   connections don't have.
2. Copy `backend/.env.example` to `backend/.env` and fill in:
   - `DATABASE_URL` — the address, with `[YOUR-PASSWORD]` replaced by your password (no brackets).
   - `APP_SECRET_KEY` — long random text (the command is in `.env.example`).

The frontend needs no settings.

## 3. Create the tables

From the `backend` folder:

```powershell
.\.venv\Scripts\alembic.exe upgrade head
```

This creates `users`, `profiles` and `categories`, and locks every table so Supabase's public
Data API can't read them (only the SpendWise backend can).

## Good to know (free plan)

- Free projects **pause after about a week without activity**. Un-pause them from the dashboard; no data is lost.
- If your database password ever leaks, reset it under **Project Settings → Database** and update `backend/.env`.
