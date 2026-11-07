"""A01: profiles and categories.

Revision ID: 0001
Revises:
Create Date: 2026-11-02

Rules enforced by the database itself (PRD sections 4 and 7):
- one profile per Supabase auth user, deleted with that user
- only GBP / en-GB / Europe/London are allowed
- category names are trimmed, 1-40 characters, unique per user and type ignoring case
- a category's type and owner can never change
- the browser-facing Supabase roles (anon, authenticated) get no access at all;
  only this backend reads and writes these tables
"""

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


UPGRADE_SQL = """
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  locale text not null default 'en-GB' check (locale = 'en-GB'),
  currency text not null default 'GBP' check (currency = 'GBP'),
  timezone text not null default 'Europe/London' check (timezone = 'Europe/London'),
  onboarding_completed_at timestamptz,
  ai_enabled boolean not null default false,
  ai_notice_version text,
  ai_enabled_at timestamptz,
  finance_revision bigint not null default 0 check (finance_revision >= 0),
  deleting_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null
    check (name = btrim(name) and char_length(name) between 1 and 40),
  category_type text not null check (category_type in ('expense', 'income')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- lets later tables reference (user_id, category_id) so a row can only
  -- point at a category owned by the same user
  constraint categories_user_id_id_key unique (user_id, id)
);

-- Unique name per user and type, ignoring case. Archived categories count too.
create unique index categories_user_type_name_key
  on public.categories (user_id, category_type, lower(name));

create or replace function public.categories_guard_immutable() returns trigger
language plpgsql as $$
begin
  if new.id <> old.id or new.user_id <> old.user_id
     or new.category_type <> old.category_type then
    raise exception 'category id, owner and type cannot be changed'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger categories_guard_immutable
  before update on public.categories
  for each row execute function public.categories_guard_immutable();

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

-- Block Supabase's public Data API: row-level security on, with no policies,
-- and no privileges for the browser roles. The backend connects as the owner.
alter table public.profiles enable row level security;
alter table public.categories enable row level security;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on table public.profiles, public.categories from %I', r);
      execute format('revoke execute on function public.set_updated_at(), public.categories_guard_immutable() from %I', r);
    end if;
  end loop;
end;
$$;
"""

DOWNGRADE_SQL = """
drop table if exists public.categories;
drop table if exists public.profiles;
drop function if exists public.categories_guard_immutable();
drop function if exists public.set_updated_at();
"""


def upgrade() -> None:
    op.execute(UPGRADE_SQL)


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
