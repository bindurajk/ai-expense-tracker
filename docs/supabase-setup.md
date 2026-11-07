# Setting up Supabase (free) — about 10 minutes

Supabase gives SpendWise its database and its sign-up / sign-in system. The free plan is enough; no card is needed.

> **Never paste keys, passwords or connection strings into a chat or AI prompt.** Type them only into the two settings files below.

## 1. Create the account and project

1. Go to <https://supabase.com> → **Start your project** → sign up (GitHub or email).
2. Click **New project**:
   - **Name:** `spendwise`
   - **Database password:** click *Generate*, then save it in your password manager. You'll need it in step 4.
   - **Region:** *West EU (London)*
   - **Plan:** Free
3. Wait a minute or two while it's created.

## 2. Turn on email verification

**Authentication → Sign In / Providers → Email**

- **Enable Email provider:** on
- **Confirm email:** on (this is what makes people verify their address)
- **Minimum password length:** `8`

Save.

**Authentication → URL Configuration**

- **Site URL:** `http://localhost:5173`
- **Redirect URLs:** add `http://localhost:5173/verify`

Save.

## 3. Frontend settings (public values)

**Project Settings → API Keys** (or **Connect → App frameworks**).

Create the file `frontend/.env.local` (copy `frontend/.env.example`) and fill in:

```
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<the "publishable" key (sb_publishable_…) or the legacy "anon" key>
```

These two are designed to be public, but use **only** these. Never put the *secret* / *service_role* key in the frontend.

## 4. Backend settings (secret values)

Click **Connect** at the top of the dashboard → **Session pooler** → copy the URI.

Create `backend/.env` (copy `backend/.env.example`) and fill in:

```
DATABASE_URL=<the session pooler URI, with [YOUR-PASSWORD] replaced by your database password>
SUPABASE_URL=https://<your-project-ref>.supabase.co
```

Leave `SUPABASE_JWT_SECRET` empty. New projects don't need it.

## 5. Tell Claude "Supabase is set up"

Claude will then:

- create the tables (`alembic upgrade head`)
- check that the browser can't read the tables directly
- run a real sign-up with a test email address you choose

## Good to know (free plan)

- Supabase's built-in email sender only sends **a few emails per hour**. That's fine for testing. Before a real launch you'd connect a free email service (custom SMTP).
- Free projects **pause after about a week without activity**. Un-pause them from the dashboard; no data is lost.
