"""T01/T02: transactions (expenses and income).

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-08

Rules enforced by the database itself:
- money is whole pence (integer), from 1p to £999,999.99; never a float
- a transaction can only use a category owned by the same user, of the same type
- the optional note is trimmed and at most 140 characters
- the same Idempotency-Key from one user can only create one transaction (no double saves)
- version starts at 1, ready for edit conflict checks (T05)
- the browser-facing Supabase roles get no access; only this backend reads and writes
"""

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


UPGRADE_SQL = """
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category_id uuid not null,
  transaction_type text not null check (transaction_type in ('expense', 'income')),
  amount_pence integer not null check (amount_pence between 1 and 99999999),
  occurred_on date not null check (occurred_on >= date '2000-01-01'),
  note text check (note is null or (note = btrim(note) and char_length(note) between 1 and 140)),
  version integer not null default 1 check (version >= 1),
  idempotency_key uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_category_same_user
    foreign key (user_id, category_id) references public.categories(user_id, id),
  constraint transactions_user_idempotency_key unique (user_id, idempotency_key)
);

create index transactions_user_date_idx
  on public.transactions (user_id, occurred_on desc, created_at desc);

create or replace function public.transactions_guard() returns trigger
language plpgsql as $$
declare cat_type text;
begin
  if tg_op = 'UPDATE' and (new.id <> old.id or new.user_id <> old.user_id) then
    raise exception 'transaction id and owner cannot be changed';
  end if;
  select category_type into cat_type from public.categories where id = new.category_id;
  if cat_type is distinct from new.transaction_type then
    raise exception 'category type must match transaction type';
  end if;
  return new;
end;
$$;

create trigger transactions_guard
  before insert or update on public.transactions
  for each row execute function public.transactions_guard();

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

alter table public.transactions enable row level security;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on table public.transactions from %I', r);
      execute format('revoke execute on function public.transactions_guard() from %I', r);
    end if;
  end loop;
end;
$$;
"""

DOWNGRADE_SQL = """
drop table if exists public.transactions;
drop function if exists public.transactions_guard();
"""


def upgrade() -> None:
    op.execute(UPGRADE_SQL)


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
