-- A looser per-network signup gift allowance for sign-ups through an org partner's link
-- (ARCHITECTURE §6.5, §7; Owner 2026-11-27). 1480 lets one signup IP receive signup_gift_per_ip
-- gifts in 24 hours (prod 5); a salesperson signing up a shop's customers on its WiFi runs past it
-- at once. New setting signup_gift_per_ip_partner (integer 0..1000, 0 = no limit, default 20),
-- saved on /admin/features with the other signup gift rules.
--
-- Which account gets it is decided by the database from its own binding, never from the client:
-- grant_credits uses it when the account is already bound through a partner link ('signup') to an
-- active org account whose org is active with the affiliate switch on (affiliate_bind resolved the
-- slug server-side). The app now binds the partner link before the gift at the first verified
-- sign-in (core/auth/first-sign-in.ts), so the binding is there when the gift is decided. The
-- count is the same as 1480's (every signup gift on that IP in the 24 hours), under the same
-- per-IP lock; only the limit differs. It is never stricter than the site-wide one: either at 0
-- means no limit, else the larger of the two. Daily cap and pause still apply. Personal partners'
-- links and sign-ups without a link keep signup_gift_per_ip.
--
-- With the binding first, the 2010 trigger sees no gift yet and records blocked_no_signup_grant;
-- grant_credits, right after it pays the gift, calls 2023's _org_signup_bonus_after_gift, which
-- pays the org bonus once under 2023's rules and deletes that row (a refused gift leaves it, as
-- before). Needs 2023.
--
-- Expand-only: create or replace of grant_credits (1480's body), admin_set_system_setting (2008's
-- body, one more key, unbanned admins only) and signup_gift_today (one more field the deployed
-- code ignores). Until the app deploys, it still pays the gift before binding: org sign-ups then
-- keep the site-wide allowance and get the bonus from the 2010 trigger as today.

-- grant_credits: 1480's body plus the partner allowance and the org bonus after the gift.
create or replace function public.grant_credits(p_user_id uuid, p_amount integer, p_reason text, p_idempotency_key text, p_pool text)
returns public.credit_change
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_today jsonb;
  v_per_ip integer;
  v_partner integer;
  v_change public.credit_change;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_INPUT' using detail = 'amount must be positive';
  end if;

  if p_idempotency_key = 'signup:' || p_user_id::text then
    perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.template_catalog',0));
    lock table public.profiles in row exclusive mode;
    select * into v_profile from public.profiles where id = p_user_id;
    p_amount := public.signup_gift_amount(v_profile.created_at);
    if p_amount = 0 then
      return row(false,v_profile.credits,v_profile.free_credits,v_profile.paid_until)::public.credit_change;
    end if;

    -- Already paid: the ledger's idempotency key makes this a no-op; never refuse it now.
    if not exists (select 1 from public.credit_ledger where idempotency_key = p_idempotency_key) then
      -- A stored refusal stands; a pending account is paid only through claim_signup_gift.
      if v_profile.signup_gift_refusal is not null then
        return row(false, v_profile.credits, v_profile.free_credits, v_profile.paid_until)::public.credit_change;
      end if;

      v_per_ip := public.signup_gift_setting_int('signup_gift_per_ip', 5);
      -- 2024: an account already bound through an org account's ?ref link at this sign-in gets the
      -- partner allowance; never stricter than the site-wide one (0 = no limit wins).
      if v_profile.referred_source = 'signup' and exists (
           select 1 from public.affiliates a join public.orgs o on o.id = a.org_id
            where a.user_id = v_profile.referred_by and a.status = 'active'
              and o.status = 'active' and o.affiliate_enabled) then
        v_partner := public.signup_gift_setting_int('signup_gift_per_ip_partner', 20);
        v_per_ip := case when v_per_ip = 0 or v_partner = 0 then 0 else greatest(v_per_ip, v_partner) end;
      end if;
      if v_profile.signup_ip is not null and v_per_ip > 0 then
        perform pg_advisory_xact_lock(hashtextextended('shotviva.signup_ip:' || host(v_profile.signup_ip), 0));
        if (select count(*)
              from public.profiles other
              join public.credit_ledger l on l.idempotency_key = 'signup:' || other.id::text
             where other.signup_ip = v_profile.signup_ip
               and other.id <> p_user_id
               and l.created_at > v_profile.created_at - interval '24 hours') >= v_per_ip then
          update public.profiles set signup_gift_refusal = 'same_ip_pending' where id = p_user_id;
          return row(false, v_profile.credits, v_profile.free_credits, v_profile.paid_until)::public.credit_change;
        end if;
      end if;

      -- One gift at a time site-wide, so concurrent sign-ups cannot all pass the count.
      perform pg_advisory_xact_lock(hashtextextended('shotviva.signup_gift_cap', 0));
      v_today := public.signup_gift_today();
      if (v_today->>'paused')::boolean then
        update public.profiles set signup_gift_refusal = 'paused' where id = p_user_id;
        return row(false, v_profile.credits, v_profile.free_credits, v_profile.paid_until)::public.credit_change;
      end if;
      if (v_today->>'granted')::integer >= (v_today->>'cap')::integer then
        update public.profiles set signup_gift_refusal = 'daily_cap' where id = p_user_id;
        return row(false, v_profile.credits, v_profile.free_credits, v_profile.paid_until)::public.credit_change;
      end if;

      v_change := public._apply_credit_change(p_user_id, p_pool, 'grant', p_amount, p_reason, p_idempotency_key);
      if v_change.applied then
        insert into public.signup_gift_claims (key_hash, method, user_id)
        select k.key_hash, k.method, p_user_id from public.signup_gift_identity_keys(p_user_id) k
        on conflict (key_hash) do nothing;
        -- 2024: the org ?ref binding now comes before the gift (2010 recorded blocked_no_signup_grant);
        -- the org bonus follows the gift as it does for a later claim (2023).
        perform public._org_signup_bonus_after_gift(p_user_id);
      end if;
      return v_change;
    end if;
  end if;

  return public._apply_credit_change(p_user_id, p_pool, 'grant', p_amount, p_reason, p_idempotency_key);
end;
$$;

-- admin_set_system_setting: 2008's body plus signup_gift_per_ip_partner.
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
                         'service_worker_shell_enabled','signup_gift_credits','signup_gift_per_ip_partner')
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
    when 'signup_gift_per_ip_partner' then
      if jsonb_typeof(p_value) is distinct from 'number' or (p_value #>> '{}') !~ '^[0-9]+$'
         or (p_value #>> '{}')::numeric > 1000 then
        raise exception 'INVALID_INPUT' using detail = 'signup_gift_per_ip_partner must be an integer from 0 to 1000';
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

-- signup_gift_today: 2008's body plus per_ip_partner.
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
    'per_ip_partner', public.signup_gift_setting_int('signup_gift_per_ip_partner', 20),
    'claim_phone', public.signup_gift_setting_bool('signup_gift_claim_phone', true),
    'claim_google', public.signup_gift_setting_bool('signup_gift_claim_google', true),
    'credits', public.signup_gift_amount(now())
  )
$$;
