"""Lock the public schema against Supabase's browser roles.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-07

Supabase grants the browser roles (anon, authenticated) access to every new table in
the public schema by default, which exposes it through the public Data API.
SpendWise never reads data from the browser directly — only this backend does — so:
- the migration bookkeeping table (alembic_version) is locked like the others;
- default privileges are removed, so tables created by later migrations start locked.
"""

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


UPGRADE_SQL = """
alter table public.alembic_version enable row level security;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on table public.alembic_version from %I', r);
      execute format('alter default privileges in schema public revoke all on tables from %I', r);
      execute format('alter default privileges in schema public revoke all on sequences from %I', r);
      execute format('alter default privileges in schema public revoke all on functions from %I', r);
      if exists (select 1 from pg_roles where rolname = 'supabase_admin') then
        execute format('alter default privileges for role postgres in schema public revoke all on tables from %I', r);
        execute format('alter default privileges for role postgres in schema public revoke all on sequences from %I', r);
        execute format('alter default privileges for role postgres in schema public revoke all on functions from %I', r);
      end if;
    end if;
  end loop;
end;
$$;
"""


def upgrade() -> None:
    op.execute(UPGRADE_SQL)


def downgrade() -> None:
    # Deliberately does not re-open access.
    op.execute("alter table public.alembic_version disable row level security")
