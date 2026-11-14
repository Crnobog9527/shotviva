-- The underscore in a LIKE pattern matches any character, including the 'a'
-- in package_monthly. Only the literal pack_ prefix identifies credit packs.
alter table public.subscriptions drop constraint subscriptions_product_id_check,
  add constraint subscriptions_product_id_check check (not starts_with(product_id,'pack_'));
drop index public.credit_ledger_user_plan_idx;
create index credit_ledger_user_plan_idx on public.credit_ledger(user_id,created_at desc,id desc)
  where pool='paid' and delta>0 and product_id is not null and not starts_with(product_id,'pack_');

CREATE OR REPLACE FUNCTION "public"."current_tier"("p_user_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_paid_until timestamptz;
  v_tier text;
begin
  select paid_until into v_paid_until from public.profiles where id = p_user_id;
  if v_paid_until is null or v_paid_until <= now() then
    return null;
  end if;

  select c.tier into v_tier
    from public.credit_ledger l join admin.catalog_products c on c.product_id=l.product_id
   where l.user_id = p_user_id
     and l.pool = 'paid'
     and l.delta > 0
     and l.product_id is not null
     and not starts_with(l.product_id,'pack_') and c.kind<>'pack'
     and not exists (
       select 1 from public.payments p
        where p.user_id = p_user_id
          and p.status in ('refunded', 'partially_refunded')
          and l.idempotency_key in ('purchase:' || p.stripe_session_id, 'renewal:' || p.stripe_invoice_id, 'purchase:' || p.waffo_payment_id)
     )
   order by l.created_at desc, l.id desc
   limit 1;

  return v_tier;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."admin_list_users"("p_query" "text" DEFAULT NULL::"text", "p_tier" "text" DEFAULT NULL::"text", "p_provider" "text" DEFAULT NULL::"text", "p_status" "text" DEFAULT NULL::"text", "p_from" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_to" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_sort" "text" DEFAULT 'created'::"text", "p_page" integer DEFAULT 1) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
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
  if p_tier is not null then
    v_where := v_where || ' and coalesce(public.current_tier(p.id), ''free'') = $6';
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
               'tier', coalesce(plan.tier, 'free'),
               'product_id', plan.product_id,
               'last_generation_at', j.created_at,
               'banned_at', p.banned_at
             ) order by ids.n)
        from unnest(v_ids) with ordinality as ids(id, n)
        join public.profiles p on p.id = ids.id
        join auth.users u on u.id = p.id
        left join lateral (
          select l.product_id, c.tier
            from public.credit_ledger l join admin.catalog_products c on c.product_id=l.product_id
           where p.paid_until > now()
             and l.user_id = p.id and l.pool = 'paid' and l.delta > 0
             and l.product_id is not null and not starts_with(l.product_id,'pack_') and c.kind<>'pack'
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
$_$;
