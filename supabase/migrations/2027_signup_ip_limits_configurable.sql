-- Per-IP limits on sign-up requests and SMS codes become admin settings, with a looser pair for
-- sign-ups through an org partner's ?ref link (ARCHITECTURE §7, §6.5; Owner 2026-11-27). A
-- channel partner's salespeople sign several customers up on one shop's WiFi; 1350's 5 an hour /
-- 20 a day per IP on signup_request and 0441's 20 a day per IP on SMS codes stopped the sign-up
-- itself, before any gift rule.
--
-- New settings (integers 1..10000, saved on /admin/features; no row = the default):
--   signup_request_ip_hourly          5    signup_request per IP per hour (1350's number)
--   signup_request_ip_daily           20   signup_request per IP per 24 hours (1350's number)
--   signup_request_ip_hourly_partner  20   the same through a valid org ?ref link
--   signup_request_ip_daily_partner   100
--   sms_ip_daily                      50   SMS codes per IP per 24 hours (was a fixed 20: this
--                                          migration raises it to 50, Owner 2026-11-27)
--   sms_ip_daily_partner              200  the same through a valid org ?ref link
-- 0 is not accepted: "no limit" on an anti-abuse rate limit is not a choice we offer. The org
-- limit is never stricter than the site-wide one: the larger of the two applies. Per-number SMS
-- limits (60 s, 5 a day) are unchanged.
--
-- Which request is an org one is decided here, never by the client: the app passes only the slug
-- of its sv_ref cookie, and _signup_org_ref resolves it with 2024's rule (the affiliate program on,
-- an active affiliates row with org_id set, its org active with the affiliate switch on). Every
-- request on the IP is counted together; only the limit differs. An unknown, personal or paused
-- slug, or none, keeps the site-wide limits.
--
-- The SMS limit is checked twice: by sms_request_send (the server action) and again by
-- sms_authorize_send (the Send SMS hook), which knows no slug. The request row remembers whether
-- it was an org one (sms_sends.org_ref, new, default false) and the hook uses that row's limit.
--
-- Expand-only: new function overloads signup_request(text, inet, text) and
-- sms_request_send(text, inet, text) with three required arguments, so a PostgREST call with two
-- named arguments still resolves to the two-argument function, which the code running before the
-- deploy calls; those are replaced to call the new ones with no slug (site-wide limits, now read
-- from the settings). sms_authorize_send keeps its signature. One new column with a default.
-- admin_set_system_setting is 2024's body plus the six keys (unbanned admins only).

-- 2024's rule for a valid org partner link, from a slug. Null or unknown: false.
create function public._signup_org_ref(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_slug ~ '^[a-z0-9-]{3,24}$' and exists (
    select 1 from public.affiliates a
      join public.orgs o on o.id = a.org_id
      join public.affiliate_settings s on s.singleton and s.enabled
     where a.slug = p_slug and a.status = 'active' and o.status = 'active' and o.affiliate_enabled), false)
$$;

revoke execute on function public._signup_org_ref(text) from public, anon, authenticated;
grant execute on function public._signup_org_ref(text) to service_role;

-- The six limits in effect (defaults when a row is missing or malformed), for the functions below
-- and the admin card. Never below 1.
create function public.signup_ip_limits()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'signup_hourly', greatest(1, public.signup_gift_setting_int('signup_request_ip_hourly', 5)),
    'signup_daily', greatest(1, public.signup_gift_setting_int('signup_request_ip_daily', 20)),
    'signup_hourly_partner', greatest(1, public.signup_gift_setting_int('signup_request_ip_hourly_partner', 20)),
    'signup_daily_partner', greatest(1, public.signup_gift_setting_int('signup_request_ip_daily_partner', 100)),
    'sms_daily', greatest(1, public.signup_gift_setting_int('sms_ip_daily', 50)),
    'sms_daily_partner', greatest(1, public.signup_gift_setting_int('sms_ip_daily_partner', 200))
  )
$$;

revoke execute on function public.signup_ip_limits() from public, anon, authenticated;
grant execute on function public.signup_ip_limits() to service_role;

-- signup_request with the visitor's sv_ref slug: 1350's body with the limits from the settings.
create function public.signup_request(p_email_key text, p_ip inet, p_ref_slug text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_limits jsonb;
  v_hourly integer;
  v_daily integer;
begin
  if p_email_key is null or p_email_key !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_INPUT' using detail = 'email_key must be a sha256 hex digest';
  end if;
  if p_ip is not null then
    perform pg_advisory_xact_lock(hashtextextended('signup:ip:' || host(p_ip), 0));
    v_limits := public.signup_ip_limits();
    v_hourly := (v_limits->>'signup_hourly')::integer;
    v_daily := (v_limits->>'signup_daily')::integer;
    if public._signup_org_ref(p_ref_slug) then
      v_hourly := greatest(v_hourly, (v_limits->>'signup_hourly_partner')::integer);
      v_daily := greatest(v_daily, (v_limits->>'signup_daily_partner')::integer);
    end if;
    if (select count(*) from public.signup_requests r
         where r.ip = p_ip and r.requested_at > now() - interval '1 hour') >= v_hourly then
      return 'ip_hourly';
    end if;
    if (select count(*) from public.signup_requests r
         where r.ip = p_ip and r.requested_at > now() - interval '24 hours') >= v_daily then
      return 'ip_daily';
    end if;
  end if;

  insert into public.signup_requests (email_key, ip) values (p_email_key, p_ip);
  delete from public.signup_requests r
   where r.id in (select o.id from public.signup_requests o
                   where o.requested_at < now() - interval '2 days'
                   order by o.requested_at
                   limit 200);
  return 'ok';
end;
$$;

revoke execute on function public.signup_request(text, inet, text) from public, anon, authenticated;
grant execute on function public.signup_request(text, inet, text) to service_role;

-- The code running before the deploy: no slug, the site-wide limits.
create or replace function public.signup_request(p_email_key text, p_ip inet)
returns text
language sql
set search_path = ''
as $$
  select public.signup_request(p_email_key, p_ip, null::text)
$$;

-- Whether a request was made through a valid org ?ref link, for the Send SMS hook's second count.
alter table public.sms_sends add column org_ref boolean not null default false;

-- sms_request_send with the visitor's sv_ref slug: 0441's body with the IP limit from the settings.
create function public.sms_request_send(p_phone_key text, p_ip inet, p_ref_slug text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_since timestamptz := now() - interval '24 hours';
  v_limits jsonb;
  v_org boolean := false;
  v_ip_daily integer;
begin
  if p_phone_key is null or p_phone_key !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_INPUT' using detail = 'phone_key must be a sha256 hex digest';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('sms:phone:' || p_phone_key, 0));
  if p_ip is not null then
    perform pg_advisory_xact_lock(hashtextextended('sms:ip:' || host(p_ip), 0));
  end if;

  if exists (select 1 from public.sms_sends s
              where s.phone_key = p_phone_key and s.requested_at > now() - interval '60 seconds') then
    return 'phone_cooldown';
  end if;
  if (select count(*) from public.sms_sends s
       where s.phone_key = p_phone_key and s.requested_at > v_since) >= 5 then
    return 'phone_daily';
  end if;
  if p_ip is not null then
    v_limits := public.signup_ip_limits();
    v_ip_daily := (v_limits->>'sms_daily')::integer;
    v_org := public._signup_org_ref(p_ref_slug);
    if v_org then
      v_ip_daily := greatest(v_ip_daily, (v_limits->>'sms_daily_partner')::integer);
    end if;
    if (select count(*) from public.sms_sends s
         where s.ip = p_ip and s.requested_at > v_since) >= v_ip_daily then
      return 'ip_daily';
    end if;
  end if;

  insert into public.sms_sends (phone_key, ip, org_ref) values (p_phone_key, p_ip, v_org);
  -- The rows have done their job after a day; keep two, then let them go.
  delete from public.sms_sends s
   where s.id in (select o.id from public.sms_sends o
                   where o.requested_at < now() - interval '2 days'
                   order by o.requested_at
                   limit 200);
  return 'ok';
end;
$$;

revoke execute on function public.sms_request_send(text, inet, text) from public, anon, authenticated;
grant execute on function public.sms_request_send(text, inet, text) to service_role;

-- The code running before the deploy: no slug, the site-wide limit.
create or replace function public.sms_request_send(p_phone_key text, p_ip inet)
returns text
language sql
set search_path = ''
as $$
  select public.sms_request_send(p_phone_key, p_ip, null::text)
$$;

-- sms_authorize_send: 0441's body, the IP count against the limit of the request it marks sent.
create or replace function public.sms_authorize_send(p_phone_key text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_since timestamptz := now() - interval '24 hours';
  v_request public.sms_sends;
  v_limits jsonb;
  v_ip_daily integer;
begin
  if p_phone_key is null or p_phone_key !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_INPUT' using detail = 'phone_key must be a sha256 hex digest';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('sms:phone:' || p_phone_key, 0));

  select * into v_request
    from public.sms_sends s
   where s.phone_key = p_phone_key and s.sent_at is null and s.requested_at > now() - interval '2 minutes'
   order by s.requested_at desc
   limit 1
   for update;
  if not found then
    return 'no_request';
  end if;

  if exists (select 1 from public.sms_sends s
              where s.phone_key = p_phone_key and s.sent_at > now() - interval '60 seconds') then
    return 'phone_cooldown';
  end if;
  if (select count(*) from public.sms_sends s
       where s.phone_key = p_phone_key and s.sent_at > v_since) >= 5 then
    return 'phone_daily';
  end if;
  if v_request.ip is not null then
    v_limits := public.signup_ip_limits();
    v_ip_daily := (v_limits->>'sms_daily')::integer;
    if v_request.org_ref then
      v_ip_daily := greatest(v_ip_daily, (v_limits->>'sms_daily_partner')::integer);
    end if;
    if (select count(*) from public.sms_sends s
         where s.ip = v_request.ip and s.sent_at > v_since) >= v_ip_daily then
      return 'ip_daily';
    end if;
  end if;

  update public.sms_sends set sent_at = now() where id = v_request.id;
  return 'ok';
end;
$$;

-- admin_set_system_setting: 2024's body plus the six per-IP limits (unbanned admins only).
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
                         'service_worker_shell_enabled','signup_gift_credits','signup_gift_per_ip_partner',
                         'signup_request_ip_hourly','signup_request_ip_daily','signup_request_ip_hourly_partner',
                         'signup_request_ip_daily_partner','sms_ip_daily','sms_ip_daily_partner')
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
    -- 2027: per-IP limits on sign-up requests and SMS codes. 0 (no limit) is not offered.
    when 'signup_request_ip_hourly', 'signup_request_ip_daily', 'signup_request_ip_hourly_partner',
         'signup_request_ip_daily_partner', 'sms_ip_daily', 'sms_ip_daily_partner' then
      if jsonb_typeof(p_value) is distinct from 'number' or (p_value #>> '{}') !~ '^[1-9][0-9]*$'
         or (p_value #>> '{}')::numeric > 10000 then
        raise exception 'INVALID_INPUT' using detail = p_key || ' must be an integer from 1 to 10000';
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
