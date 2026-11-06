-- T25: 「可疑注册」 (ARCHITECTURE §10). IPs that signed up 3 or more accounts in the last 1 or 7
-- days, most accounts first, each with its accounts so the Owner can judge and ban one by one.
-- Reads only the window's profiles through profiles_created_at_idx and groups them; per member,
-- free credits used is the net of free-pool reserve and refund rows
-- (credit_ledger_user_id_created_at_idx) and the email comes from auth.users by primary key.
-- At most 50 IPs; anything bigger is an incident to look at in Studio.

create function public.admin_signup_ip_clusters(p_days integer)
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

revoke execute on function public.admin_signup_ip_clusters(integer) from public, anon, authenticated;
grant execute on function public.admin_signup_ip_clusters(integer) to service_role;
