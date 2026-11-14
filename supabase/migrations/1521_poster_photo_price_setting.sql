-- 拍照识别's price (ARCHITECTURE §5.3「每周复用」): a runtime setting the admin saves on
-- /admin/features, so the number lives in each database, never in code. Only adds the key;
-- every other key is checked exactly as before (body copied from 0421 and its later edits).
create or replace function public.admin_set_system_setting(p_key text, p_value jsonb, p_actor uuid) returns void
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
begin
  if p_actor is null then
    raise exception 'INVALID_INPUT' using detail = 'actor is required';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_actor and p.role = 'admin'
      and (p_key not in ('code_gift_policy','code_inviter_window_days','gallery_enabled','gallery_auto_approve',
                         'signup_gift_daily_cap','signup_gift_paused','signup_gift_per_ip',
                         'signup_gift_claim_phone','signup_gift_claim_google','poster_photo_credits')
           or p.banned_at is null)) then
    raise exception 'NOT_ADMIN';
  end if;

  case p_key
    when 'wishlist_enabled', 'gallery_enabled', 'gallery_auto_approve', 'signup_gift_paused',
         'signup_gift_claim_phone', 'signup_gift_claim_google' then
      if p_value is null or jsonb_typeof(p_value) <> 'boolean' then
        raise exception 'INVALID_INPUT' using detail = p_key || ' must be a boolean';
      end if;
    when 'admin_test_daily_budget_usd' then
      if p_value is null or jsonb_typeof(p_value) <> 'number'
         or (p_value #>> '{}')::numeric < 0 or (p_value #>> '{}')::numeric > 1000 then
        raise exception 'INVALID_INPUT' using detail = 'admin_test_daily_budget_usd must be a number from 0 to 1000';
      end if;
    when 'signup_gift_daily_cap' then
      if jsonb_typeof(p_value) is distinct from 'number' or (p_value #>> '{}') !~ '^[0-9]+$'
         or (p_value #>> '{}')::numeric > 100000 then
        raise exception 'INVALID_INPUT' using detail = 'signup_gift_daily_cap must be an integer from 0 to 100000';
      end if;
    when 'signup_gift_per_ip' then
      if jsonb_typeof(p_value) is distinct from 'number' or (p_value #>> '{}') !~ '^[0-9]+$'
         or (p_value #>> '{}')::numeric > 1000 then
        raise exception 'INVALID_INPUT' using detail = 'signup_gift_per_ip must be an integer from 0 to 1000';
      end if;
    -- 拍照识别's price per run (§5.3「每周复用」, Owner 2026-11-14). Unset: the feature is off.
    when 'poster_photo_credits' then
      if jsonb_typeof(p_value) is distinct from 'number' or (p_value #>> '{}') !~ '^[1-9][0-9]*$'
         or (p_value #>> '{}')::numeric > 1000 then
        raise exception 'INVALID_INPUT' using detail = 'poster_photo_credits must be an integer from 1 to 1000';
      end if;
    when 'code_inviter_window_days' then
      if jsonb_typeof(p_value) is distinct from 'number' or
         (p_value #>> '{}') !~ '^[1-9][0-9]*$' or (p_value #>> '{}')::numeric > 2147483647 then
        raise exception 'INVALID_INPUT' using detail = 'reward window must be a positive integer';
      end if;
    when 'code_gift_policy' then
      if jsonb_typeof(p_value) is distinct from 'object' or
         jsonb_typeof(p_value->'requirePaidGiftCap') is distinct from 'boolean' or
         jsonb_typeof(p_value->'maxCreditsPerCode') is distinct from 'number' or
         (p_value->>'maxCreditsPerCode') !~ '^[1-9][0-9]*$' or
         (p_value->>'maxCreditsPerCode')::numeric > 2147483647 or
         p_value - array['requirePaidGiftCap','maxCreditsPerCode'] <> '{}'::jsonb then
        raise exception 'INVALID_INPUT' using detail = 'invalid gift code policy';
      end if;
    else
      raise exception 'INVALID_INPUT' using detail = 'unknown setting';
  end case;

  insert into public.system_settings (key, value, updated_at, updated_by)
  values (p_key, p_value, now(), p_actor)
  on conflict (key) do update
    set value = excluded.value,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;

  if p_key in ('gallery_enabled', 'gallery_auto_approve') then
    insert into public.admin_audit_log (action, user_id, reason, target_id)
    values ('gallery_setting', p_actor, p_value::text, p_key);
  end if;
end;
$_$;
