-- T77: /admin/users opens on the list of users (ARCHITECTURE §10.a 「用户管理改成列表」): 50 a
-- page, numbered pages with a total, filters (tier, sign-up method, status, sign-up dates), the
-- lookup box's email / phone substring, and three sorts. One call answers a page and its total.
--
-- The tier is current_tier()'s rule, inlined: while paid_until is in the future, the newest
-- positive paid-pool ledger row with a non-pack product names the plan (starter_monthly →
-- Starter, monthly); otherwise the account is free. Rows carry the product id so the page can
-- show monthly / yearly.
--
-- The count and the page are built from only the filters that were asked for (dynamic SQL; every
-- value is a bound parameter, the text comes from this function alone), so each call is planned
-- for what it actually filters:
--   plain list, newest first     profiles_created_at_idx scanned backwards with limit/offset; the
--                                count is a plain count over profiles
--   sign-up date range           profiles_created_at_idx
--   Starter / Pro / Max          profiles_paid_until_idx (new, partial), then the plan below
--   the plan of a paid account   credit_ledger_user_plan_idx (new, partial: purchases only, so a
--                                heavy user's thousands of reserve rows are skipped)
--   已封禁                        profiles_banned_at_idx (new, partial)
--   sort / column 最近出图         one row per user from generation_jobs_user_id_created_at_idx
--                                (user_id, created_at desc), limit 1, in a lateral join
--   email / phone / sign-up      auth.users by primary key; only joined when one of them is
--   method                       asked for (an email substring cannot use an index, as in
--                                admin_search_users)

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
  -- A ledger row that names the plan of profile p (current_tier()'s rule).
  c_plan constant text := 'l.user_id = p.id and l.pool = ''paid'' and l.delta > 0 '
                          'and l.product_id is not null and l.product_id not like ''pack_%''';
  v_q text := nullif(btrim(coalesce(p_query, '')), '');
  v_like text;
  v_digits text;
  v_where text := 'true';
  v_from text := 'public.profiles p';
  v_order text := 'p.created_at desc, p.id desc';
  v_total bigint;
  v_ids uuid[];
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

  -- Parameters: $1 email pattern, $2 phone digits, $3 sign-up method, $4 from, $5 to, $6 tier,
  -- $7 offset. The method is the one the account signed up with; linking Google later does not
  -- change it.
  if v_q is not null or p_provider is not null then
    v_where := v_where || ' and exists (select 1 from auth.users u where u.id = p.id'
      || case when v_q is null then ''
              when v_digits is null then ' and u.email ilike $1'
              else ' and (u.email ilike $1 or u.phone like ''%'' || $2 || ''%'')' end
      || case when p_provider is null then '' else ' and u.raw_app_meta_data ->> ''provider'' = $3' end
      || ')';
  end if;
  if p_status = 'banned' then
    v_where := v_where || ' and p.banned_at is not null';
  elsif p_status = 'active' then
    v_where := v_where || ' and p.banned_at is null';
  end if;
  if p_from is not null then
    v_where := v_where || ' and p.created_at >= $4';
  end if;
  if p_to is not null then
    v_where := v_where || ' and p.created_at < $5';
  end if;
  if p_tier = 'free' then
    v_where := v_where || ' and (p.paid_until is null or p.paid_until <= now() '
      || 'or not exists (select 1 from public.credit_ledger l where ' || c_plan || '))';
  elsif p_tier is not null then
    v_where := v_where || ' and p.paid_until > now() and split_part((select l.product_id '
      || 'from public.credit_ledger l where ' || c_plan
      || ' order by l.created_at desc, l.id desc limit 1), ''_'', 1) = $6';
  end if;

  execute 'select count(*) from public.profiles p where ' || v_where
    into v_total
    using v_like, v_digits, p_provider, p_from, p_to, p_tier;

  if p_sort = 'last_job' then
    v_from := v_from || ' left join lateral (select g.created_at from public.generation_jobs g '
      || 'where g.user_id = p.id order by g.created_at desc limit 1) j on true';
    v_order := 'j.created_at desc nulls last, p.created_at desc, p.id desc';
  elsif p_sort = 'paid_credits' then
    v_order := 'p.credits desc, p.created_at desc, p.id desc';
  end if;

  -- ARRAY(subquery) keeps the subquery's order.
  execute 'select array(select p.id from ' || v_from || ' where ' || v_where
      || ' order by ' || v_order || ' limit 50 offset $7)'
    into v_ids
    using v_like, v_digits, p_provider, p_from, p_to, p_tier, (p_page - 1) * 50;

  -- The 50 rows of the page, each joined by primary key.
  return jsonb_build_object(
    'total', v_total,
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'email', u.email::text,
               'phone', nullif(u.phone, '')::text,
               'created_at', p.created_at,
               'provider', u.raw_app_meta_data ->> 'provider',
               'role', p.role,
               'credits', p.credits,
               'free_credits', p.free_credits,
               'paid_until', p.paid_until,
               'tier', coalesce(split_part(plan.product_id, '_', 1), 'free'),
               'product_id', plan.product_id,
               'last_generation_at', j.created_at,
               'banned_at', p.banned_at
             ) order by ids.n)
        from unnest(v_ids) with ordinality as ids(id, n)
        join public.profiles p on p.id = ids.id
        join auth.users u on u.id = p.id
        left join lateral (
          select l.product_id
            from public.credit_ledger l
           where p.paid_until > now()
             and l.user_id = p.id and l.pool = 'paid' and l.delta > 0
             and l.product_id is not null and l.product_id not like 'pack_%'
           order by l.created_at desc, l.id desc
           limit 1
        ) plan on true
        left join lateral (
          select g.created_at
            from public.generation_jobs g
           where g.user_id = p.id
           order by g.created_at desc
           limit 1
        ) j on true
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.admin_list_users(text, text, text, text, timestamptz, timestamptz, text, integer) from public, anon, authenticated;
grant execute on function public.admin_list_users(text, text, text, text, timestamptz, timestamptz, text, integer) to service_role;
