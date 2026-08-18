-- Bootstrap SQL for the dedicated, least-privilege application runtime role.
--
-- Run this ONCE per environment (local ephemeral test database, hosted
-- Supabase dev project, hosted Supabase production project — never shared
-- across environments), as a role privileged enough to CREATE ROLE and
-- GRANT (e.g. Supabase's default `postgres` role, or the local
-- `prisma dev` Postgres's default `postgres` role).
--
-- This is deliberately NOT a Prisma migration: it is environment-specific
-- (contains a password) and must be applied before any migration that
-- depends on it existing. See docs/architecture.md §5.3a and
-- docs/decisions.md D16.
--
-- Idempotent: safe to re-run against an environment where it has already
-- been applied.
--
-- BEFORE RUNNING: replace REPLACE_WITH_STRONG_PASSWORD below with a real,
-- unique password for this specific environment. Never reuse a password
-- across environments (dev vs. production).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user WITH
      LOGIN
      PASSWORD 'REPLACE_WITH_STRONG_PASSWORD'
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      NOBYPASSRLS;
  END IF;
END
$$;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO app_user', current_database());
END
$$;

GRANT USAGE ON SCHEMA public TO app_user;

-- DML only — no DDL, no DELETE. This application never hard-deletes tenant
-- records (see docs/product-spec.md Business Rules); extend this list in
-- later-phase migrations as new tenant tables are added.
GRANT SELECT, INSERT, UPDATE ON public.gyms TO app_user;
GRANT SELECT, INSERT, UPDATE ON public.users TO app_user;
GRANT SELECT, INSERT, UPDATE ON public.gym_memberships TO app_user;

GRANT USAGE ON TYPE public.gym_status TO app_user;
GRANT USAGE ON TYPE public.membership_role TO app_user;
