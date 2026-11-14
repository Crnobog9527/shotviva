-- T94: prices and credit grants come from the server's site catalog. The product mirror
-- establishes identity, availability and membership status. Monetary ratios are compared
-- as integer cross-products, including when finding the cheapest candidate.
create function public._validate_code_discount(
  p_products text[], p_percent integer, p_catalog jsonb, p_floor_product_id text
) returns void language plpgsql stable security definer set search_path = '' as $$
declare
  entry record;
  cents numeric;
  credits numeric;
  active_rates jsonb := '{}';
  floor_cents numeric;
  floor_credits numeric;
  invalid_products text[];
begin
  if jsonb_typeof(p_catalog) is distinct from 'array' or p_floor_product_id is null then
    raise exception 'INVALID_CODE_CATALOG';
  end if;
  if jsonb_array_length(p_catalog) > (select count(*) from public.products) then
    raise exception 'INVALID_CODE_CATALOG';
  end if;

  for entry in
    select data.item, p.id, p.active, (p.days is not null) as subscription
      from jsonb_array_elements(p_catalog) as data(item)
      left join public.products p on p.id = data.item->>'id'
  loop
    if entry.id is null or active_rates ? entry.id
      or jsonb_typeof(entry.item->'priceCents') is distinct from 'number'
      or jsonb_typeof(entry.item->'credits') is distinct from 'number'
      or entry.item->'subscription' is distinct from to_jsonb(entry.subscription) then
      raise exception 'INVALID_CODE_CATALOG';
    end if;
    cents := (entry.item->>'priceCents')::numeric;
    credits := (entry.item->>'credits')::numeric;
    if cents <= 0 or cents <> trunc(cents) or cents > 9007199254740991
      or credits <= 0 or credits <> trunc(credits) or credits > 2147483647 then
      raise exception 'INVALID_CODE_CATALOG';
    end if;
    -- Keep an inactive ID as JSON null so duplicates are still rejected but the product
    -- cannot be either a floor or a discount target.
    active_rates := active_rates || jsonb_build_object(entry.id, case when entry.active then entry.item end);
  end loop;

  floor_cents := (active_rates->p_floor_product_id->>'priceCents')::numeric;
  floor_credits := (active_rates->p_floor_product_id->>'credits')::numeric;
  if active_rates->p_floor_product_id->'subscription' is distinct from 'true'::jsonb
     or exists (select 1 from public.products p where p.active and p.days is not null and
          (not (active_rates ? p.id) or
           (active_rates->p.id->>'priceCents')::numeric * floor_credits
             < floor_cents * (active_rates->p.id->>'credits')::numeric)) then
    raise exception 'INVALID_CODE_CATALOG';
  end if;

  select array_agg(t.id order by t.id) into invalid_products from unnest(p_products) t(id)
    where (active_rates->t.id->>'credits') is null
       or (active_rates->t.id->>'priceCents')::numeric * (100 - p_percent) * floor_credits
          < floor_cents * (active_rates->t.id->>'credits')::numeric * 100;
  if invalid_products is not null then
    raise exception 'CODE_DISCOUNT_PRODUCTS' using detail = to_json(invalid_products)::text;
  end if;
end;
$$;
revoke all on function public._validate_code_discount(text[],integer,jsonb,text)
  from public, anon, authenticated, service_role;

create function public.admin_save_code(p_actor uuid, p_code_id uuid, p_fields jsonb, p_catalog jsonb, p_floor_product_id text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_old public.codes;
  v_new public.codes;
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'admin' and banned_at is null) then
    raise exception 'NOT_ADMIN';
  end if;
  if p_code_id is null or jsonb_typeof(p_fields) is distinct from 'object' or p_fields = '{}' or
     p_fields - array['code','note','invitee_credits','invitee_pool','discount_percent','discount_products',
       'discount_duration','discount_months','discount_valid_days','stripe_coupon_id','starts_at',
       'expires_at','max_redemptions','new_users_only','active'] <> '{}' then
    raise exception 'INVALID_INPUT';
  end if;
  -- A repeated create request can arrive before the first transaction has inserted its row.
  perform pg_advisory_xact_lock(hashtextextended('shotviva.admin_code:' || p_code_id::text, 0));
  select c.* into v_old from public.codes c where c.id = p_code_id for update;
  if v_old.id is not null and v_old.kind <> 'campaign' then raise exception 'INVALID_CODE_KIND'; end if;

  select * into v_new from jsonb_populate_record(v_old, p_fields);
  v_new.code := upper(v_new.code);
  if v_new.invitee_credits is not null then v_new.invitee_pool := coalesce(v_new.invitee_pool, 'free'); end if;

  -- Reject edits even if the new percentage would pass the floor: Stripe cannot mutate the coupon.
  if v_old.id is not null and
    row(v_new.discount_percent, v_new.discount_products, v_new.discount_duration, v_new.discount_months,
        v_new.discount_valid_days, v_new.stripe_coupon_id) is distinct from
    row(v_old.discount_percent, v_old.discount_products, v_old.discount_duration, v_old.discount_months,
        v_old.discount_valid_days, v_old.stripe_coupon_id) then
    raise exception 'CODE_DISCOUNT_IMMUTABLE';
  end if;
  if v_new.max_redemptions < coalesce(v_old.redemption_count, 0) then
    raise exception 'CODE_QUOTA_BELOW_CLAIMED';
  end if;
  -- Existing discount terms are immutable. Editing metadata must still work after a reprice.
  if v_old.id is null and v_new.discount_percent is not null then
    if nullif(btrim(v_new.stripe_coupon_id), '') is null or coalesce(cardinality(v_new.discount_products), 0) = 0 then
      raise exception 'INVALID_DISCOUNT';
    end if;
    perform public._validate_code_discount(v_new.discount_products, v_new.discount_percent, p_catalog, p_floor_product_id);
  end if;

  if v_old.id is not null and v_old is not distinct from v_new then return v_old.id; end if;
  if v_old.id is null then
    insert into public.codes(id, code, kind, note, invitee_credits, invitee_pool, discount_percent,
      discount_products, discount_duration, discount_months, discount_valid_days, stripe_coupon_id,
      starts_at, expires_at, max_redemptions, active, new_users_only, created_by)
    values (p_code_id, v_new.code, 'campaign', v_new.note, v_new.invitee_credits, v_new.invitee_pool,
      v_new.discount_percent, v_new.discount_products, v_new.discount_duration, v_new.discount_months,
      v_new.discount_valid_days, v_new.stripe_coupon_id, v_new.starts_at, v_new.expires_at,
      v_new.max_redemptions, coalesce(v_new.active,true), coalesce(v_new.new_users_only,false), p_actor);
  else
    update public.codes set code = v_new.code, note = v_new.note, invitee_credits = v_new.invitee_credits,
      invitee_pool = v_new.invitee_pool, starts_at = v_new.starts_at, expires_at = v_new.expires_at,
      max_redemptions = v_new.max_redemptions, active = v_new.active, new_users_only = v_new.new_users_only,
      updated_at = now() where id = p_code_id;
  end if;
  insert into public.admin_audit_log(action, user_id, target_id, reason)
  values ('save_code', p_actor, p_code_id::text, v_new.code);
  return p_code_id;
end;
$$;
revoke all on function public.admin_save_code(uuid,uuid,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function public.admin_save_code(uuid,uuid,jsonb,jsonb,text) to service_role;

-- Deployed three-argument callers keep the same signature and return type. Build the
-- equivalent catalog and exact floor from the local mirror; all writes use the overload.
create or replace function public.admin_save_code(p_actor uuid, p_code_id uuid, p_fields jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  catalog jsonb;
  floor_id text;
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'admin' and banned_at is null) then
    raise exception 'NOT_ADMIN';
  end if;
  select jsonb_agg(jsonb_build_object('id', p.id, 'priceCents', p.price_usd * 100,
                 'credits', p.credits, 'subscription', p.days is not null) order by p.id)
    into catalog from public.products p where p.active;
  select p.id into floor_id from public.products p where p.active and p.days is not null and
      not exists (select 1 from public.products s where s.active and s.days is not null and
                    s.price_usd * p.credits < p.price_usd * s.credits)
    order by p.id limit 1;
  return public.admin_save_code(p_actor, p_code_id, p_fields, catalog, floor_id);
end;
$$;
revoke all on function public.admin_save_code(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.admin_save_code(uuid,uuid,jsonb) to service_role;
