-- T94. The server chooses the UUID before creating a Stripe coupon (metadata.code_id).
-- Patch only the form fields. The actor, usage count and attribution come from the database.
create function public.admin_save_code(p_actor uuid, p_code_id uuid, p_fields jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_old public.codes;
  v_new public.codes;
  v_invalid text[];
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
  if v_new.discount_percent is not null then
    if nullif(btrim(v_new.stripe_coupon_id), '') is null or coalesce(cardinality(v_new.discount_products), 0) = 0 then
      raise exception 'INVALID_DISCOUNT';
    end if;
    select array_agg(t.id order by t.id) into v_invalid
      from unnest(v_new.discount_products) as t(id)
      left join public.products p on p.id = t.id
      where p.id is null or not p.active
        or p.price_usd * (100 - v_new.discount_percent) < 100 * p.credits * 0.208;
    if v_invalid is not null then
      raise exception 'CODE_DISCOUNT_PRODUCTS' using detail = to_json(v_invalid)::text;
    end if;
  end if;

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
revoke all on function public.admin_save_code(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.admin_save_code(uuid,uuid,jsonb) to service_role;
