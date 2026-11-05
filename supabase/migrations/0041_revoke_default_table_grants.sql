-- T20: templates and profiles still carried the platform's default table privileges for the
-- client roles (REFERENCES, TRIGGER, TRUNCATE, MAINTAIN; observed in schema.sql on T15 PR
-- #24). RLS does not govern those, and TRUNCATE in particular bypasses it. Strip everything
-- and grant back only what the existing RLS policies serve:
--   templates  select for anon and authenticated (templates_select_active)
--   profiles   select for authenticated (profiles_select_own); anon gets nothing
-- service_role grants are unchanged.

revoke all on public.templates from anon, authenticated;
grant select on public.templates to anon, authenticated;

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
