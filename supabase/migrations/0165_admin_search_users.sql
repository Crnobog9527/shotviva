-- T23: email search for /admin/users (ARCHITECTURE §10). The admin schema is not on the Data
-- API, so the server reaches admin.users_overview only through this service-role function.
-- Infix ilike on auth.users is a sequential scan; fine at this size, and the per-user job
-- count inside the view uses generation_jobs_user_id_created_at_idx for the matched rows only.

create function public.admin_search_users(p_query text)
returns table (
  id uuid,
  email text,
  created_at timestamptz,
  provider text,
  role text,
  credits integer,
  free_credits integer,
  paid_until timestamptz,
  generation_count integer,
  last_generation_at timestamptz,
  banned_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  select o.id, o.email, o.created_at, o.provider, o.role, o.credits, o.free_credits, o.paid_until,
         o.generation_count, o.last_generation_at, o.banned_at
    from admin.users_overview o
   -- The query is a literal substring: % and _ typed by the admin match themselves.
   where length(btrim(coalesce(p_query, ''))) > 0
     and o.email ilike '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
   order by o.created_at desc, o.id desc
   limit 50
$$;

revoke execute on function public.admin_search_users(text) from public, anon, authenticated;
grant execute on function public.admin_search_users(text) to service_role;
