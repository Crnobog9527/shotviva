-- T20: one row per user for the Owner to search by email in Supabase Studio
-- (ARCHITECTURE §10). Lives in its own `admin` schema, which is not on the Data API's
-- exposed list (supabase/config.toml [api] schemas, and the hosted project's API settings),
-- so no client request can reach it. Only postgres (Studio) and service_role read it.
--
-- The email is read live from auth.users, never copied. The view runs with its owner's
-- (postgres) rights, which is how it can read auth.users; that is why every other role is
-- stripped of access below rather than trusting defaults.

create schema admin;

revoke all on schema admin from public, anon, authenticated;
grant usage on schema admin to service_role;

create view admin.users_overview as
select
  u.id,
  u.email::text as email,
  u.created_at,
  -- Sign-in methods the account has linked, e.g. 'email' or 'email, google'.
  coalesce(
    (select string_agg(provider, ', ' order by provider)
       from jsonb_array_elements_text(coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb)) as provider),
    u.raw_app_meta_data ->> 'provider'
  ) as provider,
  p.role,
  p.credits,
  p.free_credits,
  p.paid_until,
  coalesce(j.generation_count, 0) as generation_count,
  j.last_generation_at,
  p.banned_at
from auth.users u
left join public.profiles p on p.id = u.id
left join lateral (
  select count(*)::integer as generation_count, max(g.created_at) as last_generation_at
    from public.generation_jobs g
   where g.user_id = u.id
) j on true;

comment on view admin.users_overview is
  'Owner support view (ARCHITECTURE §10): search by email; credits = paid pool, free_credits = free pool.';

revoke all on admin.users_overview from public, anon, authenticated;
grant select on admin.users_overview to service_role;
