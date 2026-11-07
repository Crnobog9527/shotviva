-- T63: phone-number accounts in /admin/users (ARCHITECTURE §7, §10). A phone sign-up may have no
-- email, so the support views carry auth.users.phone (E.164 digits without '+', e.g.
-- 8614000005678) next to the email, and the search matches either.
--
-- users_overview: phone is added as the last column (create or replace view may only append).
-- admin_search_users: its result gains a phone column, and a function's result type cannot be
-- changed in place, so it is dropped and created again in this one transaction, with the same
-- grants. Callers that predate this read the columns they know and ignore the new one.
-- admin_signup_ip_clusters: each member also names its phone.

create or replace view admin.users_overview as
select
  u.id,
  u.email::text as email,
  u.created_at,
  -- Sign-in methods the account has linked, e.g. 'email', 'email, google' or 'phone'.
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
  p.banned_at,
  nullif(u.phone, '')::text as phone
from auth.users u
left join public.profiles p on p.id = u.id
left join lateral (
  select count(*)::integer as generation_count, max(g.created_at) as last_generation_at
    from public.generation_jobs g
   where g.user_id = u.id
) j on true;

comment on view admin.users_overview is
  'Owner support view (ARCHITECTURE §10): search by email or phone; credits = paid pool, free_credits = free pool.';

drop function public.admin_search_users(text);

-- An email substring as before; a query with at least 4 digits also matches the phone, ignoring
-- spaces, dashes and a leading + (so "+86 140 0000" finds 8614000005678).
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
  banned_at timestamptz,
  phone text
)
language sql
stable
set search_path = ''
as $$
  select o.id, o.email, o.created_at, o.provider, o.role, o.credits, o.free_credits, o.paid_until,
         o.generation_count, o.last_generation_at, o.banned_at, o.phone
    from admin.users_overview o
   -- The query is a literal substring: % and _ typed by the admin match themselves.
   where length(btrim(coalesce(p_query, ''))) > 0
     and (o.email ilike '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
          or (btrim(p_query) ~ '^\+?[0-9][0-9 -]{2,}$'
              and length(regexp_replace(p_query, '[^0-9]', '', 'g')) >= 4
              and o.phone like '%' || regexp_replace(p_query, '[^0-9]', '', 'g') || '%'))
   order by o.created_at desc, o.id desc
   limit 50
$$;

revoke execute on function public.admin_search_users(text) from public, anon, authenticated;
grant execute on function public.admin_search_users(text) to service_role;

create or replace function public.admin_signup_ip_clusters(p_days integer)
returns table (
  signup_ip inet,
  accounts integer,
  last_signup_at timestamptz,
  members jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_days is null or p_days not in (1, 7) then
    raise exception 'INVALID_INPUT' using detail = 'p_days must be 1 or 7';
  end if;

  return query
  with recent as (
    select p.id, p.signup_ip, p.created_at, p.free_credits, p.banned_at
      from public.profiles p
     where p.created_at >= now() - make_interval(days => p_days)
       and p.signup_ip is not null
  ), clusters as (
    select r.signup_ip, count(*)::integer as accounts, max(r.created_at) as last_signup_at
      from recent r
     group by r.signup_ip
    having count(*) >= 3
     order by count(*) desc, max(r.created_at) desc
     limit 50
  )
  select c.signup_ip, c.accounts, c.last_signup_at,
         (select jsonb_agg(jsonb_build_object(
                    'id', r.id,
                    'email', u.email,
                    'phone', nullif(u.phone, ''),
                    'created_at', r.created_at,
                    'free_credits', r.free_credits,
                    'free_used', coalesce(used.credits, 0),
                    'banned_at', r.banned_at)
                  order by r.created_at desc)
            from recent r
            left join auth.users u on u.id = r.id
            left join lateral (
              select -sum(l.delta)::integer as credits
                from public.credit_ledger l
               where l.user_id = r.id and l.pool = 'free' and l.kind in ('reserve', 'refund')
            ) used on true
           where r.signup_ip = c.signup_ip)
    from clusters c
   order by c.accounts desc, c.last_signup_at desc;
end;
$$;
