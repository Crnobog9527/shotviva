-- T77: /admin/users opens on the list of users (ARCHITECTURE §10.a 「用户管理改成列表」): 50 a
-- page, numbered pages with a total, filters (tier, sign-up method, status, sign-up dates), the
-- lookup box's email / phone substring, and three sorts. One call answers a page and its total.
--
-- The tier is current_tier()'s rule, inlined so a page is one query: while paid_until is in the
-- future, the newest positive paid-pool ledger row with a non-pack product names the plan
-- (starter_monthly → Starter, monthly); otherwise the account is free. The row comes back with
-- the product id so the page can show monthly / yearly.
--
-- Indexes, per part of the query:
--   page in sign-up order, date range   profiles_created_at_idx (0040)
--   the plan of a paid account          credit_ledger_user_plan_idx (new, partial: purchases only,
--                                        so a heavy user's thousands of reserve rows are skipped)
--   Starter / Pro / Max filter          profiles_paid_until_idx (new, partial)
--   已封禁 filter                        profiles_banned_at_idx (new, partial)
--   last generation (sort and column)   generation_jobs_user_id_created_at_idx
--   auth.users                          its primary key
-- The email substring cannot use an index (ilike '%…%'), as in admin_search_users; the total
-- counts the whole filtered set, which is what the page shows.

create index credit_ledger_user_plan_idx
  on public.credit_ledger (user_id, created_at desc, id desc)
  where pool = 'paid' and delta > 0 and product_id is not null and product_id not like 'pack_%';

create index profiles_paid_until_idx on public.profiles (paid_until) where paid_until is not null;

create index profiles_banned_at_idx on public.profiles (banned_at) where banned_at is not null;

-- service_role only (the admin pages call it after requireAdmin). Security definer because it
-- reads auth.users; search_path is empty, every name is qualified.
create function public.admin_list_users(
  p_query text default null,
  p_tier text default null,
  p_provider text default null,
  p_status text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_sort text default 'created',
  p_page integer default 1
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := nullif(btrim(coalesce(p_query, '')), '');
  v_like text;
  v_digits text;
begin
  if p_tier is not null and p_tier not in ('free', 'starter', 'pro', 'max') then
    raise exception 'INVALID_INPUT' using detail = 'tier must be free, starter, pro or max';
  end if;
  if p_provider is not null and p_provider not in ('email', 'google', 'phone') then
    raise exception 'INVALID_INPUT' using detail = 'provider must be email, google or phone';
  end if;
  if p_status is not null and p_status not in ('active', 'banned') then
    raise exception 'INVALID_INPUT' using detail = 'status must be active or banned';
  end if;
  if p_sort is null or p_sort not in ('created', 'last_job', 'paid_credits') then
    raise exception 'INVALID_INPUT' using detail = 'sort must be created, last_job or paid_credits';
  end if;
  if p_page is null or p_page < 1 or p_page > 10000 then
    raise exception 'INVALID_INPUT' using detail = 'page must be between 1 and 10000';
  end if;
  if length(v_q) > 320 then
    raise exception 'INVALID_INPUT' using detail = 'query is too long';
  end if;

  -- The lookup box's substring rules (admin_search_users, 0442): % and _ match themselves; a
  -- query of digits, spaces, dashes and a leading + with at least 4 digits also matches the phone.
  if v_q is not null then
    v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    if v_q ~ '^\+?[0-9][0-9 -]{2,}$' and length(regexp_replace(v_q, '[^0-9]', '', 'g')) >= 4 then
      v_digits := regexp_replace(v_q, '[^0-9]', '', 'g');
    end if;
  end if;

  return (
    with matched as (
      select p.id, p.created_at, p.role, p.credits, p.free_credits, p.paid_until, p.banned_at,
             u.email::text as email,
             nullif(u.phone, '')::text as phone,
             -- The method the account signed up with; linking Google later does not change it.
             u.raw_app_meta_data ->> 'provider' as provider,
             plan.product_id
        from public.profiles p
        join auth.users u on u.id = p.id
        left join lateral (
          select l.product_id
            from public.credit_ledger l
           where p.paid_until > now()
             and l.user_id = p.id
             and l.pool = 'paid'
             and l.delta > 0
             and l.product_id is not null
             and l.product_id not like 'pack_%'
           order by l.created_at desc, l.id desc
           limit 1
        ) plan on true
       where (v_q is null
              or u.email ilike v_like
              or (v_digits is not null and u.phone like '%' || v_digits || '%'))
         and (p_provider is null or u.raw_app_meta_data ->> 'provider' = p_provider)
         and (p_status is null or (p_status = 'banned') = (p.banned_at is not null))
         and (p_from is null or p.created_at >= p_from)
         and (p_to is null or p.created_at < p_to)
         and (p_tier is null or p_tier = 'free' or p.paid_until > now())
    ), filtered as (
      select m.*, coalesce(split_part(m.product_id, '_', 1), 'free') as tier
        from matched m
       where p_tier is null or coalesce(split_part(m.product_id, '_', 1), 'free') = p_tier
    ), ranked as (
      select f.*,
             row_number() over (
               order by
                 case when p_sort = 'paid_credits' then f.credits end desc nulls last,
                 -- Only evaluated when sorting by it: CASE skips the subquery otherwise.
                 case when p_sort = 'last_job' then
                   (select max(g.created_at) from public.generation_jobs g where g.user_id = f.id)
                 end desc nulls last,
                 f.created_at desc,
                 f.id desc
             ) as position
        from filtered f
    ), page as (
      select r.*
        from ranked r
       where r.position > (p_page - 1) * 50
         and r.position <= p_page * 50
    )
    select jsonb_build_object(
      'total', (select count(*) from filtered),
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', pg.id,
                 'email', pg.email,
                 'phone', pg.phone,
                 'created_at', pg.created_at,
                 'provider', pg.provider,
                 'role', pg.role,
                 'credits', pg.credits,
                 'free_credits', pg.free_credits,
                 'paid_until', pg.paid_until,
                 'tier', pg.tier,
                 'product_id', pg.product_id,
                 'last_generation_at', (select max(g.created_at) from public.generation_jobs g where g.user_id = pg.id),
                 'banned_at', pg.banned_at
               ) order by pg.position)
          from page pg
      ), '[]'::jsonb)
    )
  );
end;
$$;

revoke execute on function public.admin_list_users(text, text, text, text, timestamptz, timestamptz, text, integer) from public, anon, authenticated;
grant execute on function public.admin_list_users(text, text, text, text, timestamptz, timestamptz, text, integer) to service_role;
