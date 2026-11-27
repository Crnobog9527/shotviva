-- 2008: the signup gift's amount is a setting the Owner changes in the admin (「注册赠送规则」 on
-- /admin/features), not a number in a migration (ARCHITECTURE §7). Owner, 2026-11-27: 100 credits
-- is too few for a new account to try editing.
--
-- system_settings key signup_gift_credits, an integer from 1 to 5000; no row (or a row outside that
-- range) means 100, the amount 1480 hard-coded, so this migration alone changes nothing. 0 is not
-- accepted: signup_gift_paused already stops the gift, and an amount of 0 would make grant_credits
-- skip without storing a refusal, so a later raise would pay those accounts on their next sign-in.
--
-- The amount is read when the grant runs: grant_credits (first verified sign-in) and
-- claim_signup_gift (a pending account claiming later) both take it from signup_gift_amount,
-- never from the caller, so the client and the app's own number cannot change it. The idempotency
-- key ('signup:' || user id) is unchanged: an account is paid once, at the amount of that moment.
-- Accounts created before the pricing cutover still get 0, and 6 is still the amount before any
-- cutover exists (a local database without the v2 catalogue).
--
-- Expand-only: the deployed code passes its own amount to grant_credits, which the function has
-- always replaced with signup_gift_amount (1480); signup_gift_today gains a 'credits' field the
-- deployed code ignores; admin_set_system_setting accepts one more key (unbanned admins only),
-- every other key checked exactly as in 2001, whose body this is.

create or replace function public.signup_gift_amount(p_created_at timestamptz)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when cutoff is null then 6
           when p_created_at < cutoff then 0
           else (select case when n between 1 and 5000 then n else 100 end
                   from (select public.signup_gift_setting_int('signup_gift_credits', 100) as n) s)
         end
    from (select (select s.updated_at from public.system_settings s
                   where s.key = 'pricing_catalog_version' and s.value = '"v2"'::jsonb) as cutoff) c
$$;

-- The admin card shows the amount next to the other rules; the amount a new account gets today.
create or replace function public.signup_gift_today()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'granted', (select count(*) from public.credit_ledger l
                 where l.kind = 'grant' and l.reason = 'signup' and l.idempotency_key like 'signup:%'
                   and l.created_at >= public.signup_gift_day_start()),
    'cap', public.signup_gift_setting_int('signup_gift_daily_cap', 30),
    'paused', public.signup_gift_setting_bool('signup_gift_paused', false),
    'per_ip', public.signup_gift_setting_int('signup_gift_per_ip', 5),
    'claim_phone', public.signup_gift_setting_bool('signup_gift_claim_phone', true),
    'claim_google', public.signup_gift_setting_bool('signup_gift_claim_google', true),
    'credits', public.signup_gift_amount(now())
  )
$$;

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
                         'signup_gift_claim_phone','signup_gift_claim_google','poster_photo_credits',
                         'catalog_economics_policy','food_toggles_enabled','service_worker_enabled',
                         'service_worker_shell_enabled','signup_gift_credits')
           or p.banned_at is null)) then
    raise exception 'NOT_ADMIN';
  end if;

  case p_key
    when 'wishlist_enabled', 'gallery_enabled', 'gallery_auto_approve', 'signup_gift_paused',
         'signup_gift_claim_phone', 'signup_gift_claim_google', 'food_toggles_enabled',
         'service_worker_enabled', 'service_worker_shell_enabled' then
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
    -- 2008: the signup gift's amount (ARCHITECTURE §7). 0 is not offered: the pause stops the gift.
    when 'signup_gift_credits' then
      if jsonb_typeof(p_value) is distinct from 'number' or (p_value #>> '{}') !~ '^[1-9][0-9]*$'
         or (p_value #>> '{}')::numeric > 5000 then
        raise exception 'INVALID_INPUT' using detail = 'signup_gift_credits must be an integer from 1 to 5000';
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
    -- 1568: the catalogue economics policy (§6.2 第 5 项), the same shape admin.catalog_policy()
    -- accepts: exactly the five basis-point integers, fees + the larger commission under 100%.
    when 'catalog_economics_policy' then
      -- Separate steps: no cast runs before the shape is known (SQL does not short-circuit OR).
      if jsonb_typeof(p_value) is distinct from 'object' then
        raise exception 'INVALID_INPUT' using detail = 'catalog_economics_policy must be an object';
      end if;
      if p_value - array['payment_bp','refund_bp','yearly_commission_bp','other_commission_bp','margin_bp'] <> '{}'::jsonb
         or exists (select from unnest(array['payment_bp','refund_bp','yearly_commission_bp','other_commission_bp','margin_bp']) k
              where jsonb_typeof(p_value->k) is distinct from 'number' or (p_value->>k) !~ '^[0-9]{1,4}$') then
        raise exception 'INVALID_INPUT' using detail = 'catalog_economics_policy must be five basis-point integers';
      end if;
      if (p_value->>'payment_bp')::int + (p_value->>'refund_bp')::int
         + greatest((p_value->>'yearly_commission_bp')::int, (p_value->>'other_commission_bp')::int) >= 10000 then
        raise exception 'INVALID_INPUT' using detail = 'catalog_economics_policy fees must stay under 100%';
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
