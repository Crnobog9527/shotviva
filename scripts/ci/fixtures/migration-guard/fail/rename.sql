-- expect: rename, rename, rename, set-schema
alter table public.templates rename column title to name;
alter table if exists public.templates rename to catalog_templates;
alter function public.reserve_credits(uuid, integer) rename to hold_credits;
alter view public.admin_stats set schema private;
