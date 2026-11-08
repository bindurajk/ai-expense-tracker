"""Own email + password accounts (replaces Supabase Auth).

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-07

- users: one row per account. Email is stored lower-case and trimmed, and is unique.
  Only an Argon2 password hash is stored, never the password.
- token_version lets us sign a user out everywhere later (e.g. after a password change).
- profiles now belong to users instead of Supabase's auth.users.
"""

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


UPGRADE_SQL = """
create table public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null
    check (email = lower(btrim(email)) and char_length(email) between 3 and 254
           and position('@' in email) > 1),
  password_hash text not null check (password_hash like '$argon2%'),
  token_version integer not null default 1 check (token_version >= 1),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index users_email_key on public.users (email);

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

alter table public.profiles drop constraint profiles_id_fkey;
alter table public.profiles
  add constraint profiles_id_fkey foreign key (id) references public.users(id) on delete cascade;

alter table public.users enable row level security;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on table public.users from %I', r);
    end if;
  end loop;
end;
$$;
"""

DOWNGRADE_SQL = """
alter table public.profiles drop constraint profiles_id_fkey;
delete from public.profiles;
alter table public.profiles
  add constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade;
drop table public.users;
"""


def upgrade() -> None:
    op.execute(UPGRADE_SQL)


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
