-- Org staff invite codes get the channel-partner allowances (ARCHITECTURE §6.5 / §7; found by
-- Codex validation on the test site, 2026-11-27).
--
-- #971 (2024, the looser per-network signup gift allowance) and #976 (2027, the looser per-IP
-- sign-up request and SMS limits) recognised only an org partner's ?ref link. A customer a
-- salesperson signs up with the staff member's invite code (form field or ?code= link) on a shop
-- network that already had 5 gifts was left same_ip_pending; the code was then refused for the
-- missing gift and the customer was never bound to the org. Now a sign-up whose code is an org
-- staff member's invite code counts as an org-channel sign-up for all three allowances.
--
-- Which code is "an org staff member's": _org_staff_code(code, user), the rule 2025 uses for the
-- org same-IP exemption (the org_l1 branch of _org_attribute_invite): an active invite code whose
-- owner is an active member of an active org with the affiliate switch on and an active org
-- account, with the affiliate programme on (as _signup_org_ref, 2027); for a known account also
-- not the org account itself, not an active member of that org, and unbound or bound to that org
-- account. Decided in SQL from the code; the app only passes the code the server holds (the form
-- field, the sv_code cookie or the 2030 stored row), like the sv_ref slug in 2027. Anyone can type
-- a staff member's code, as anyone can open a ?ref link; the loosening only follows a code that
-- will bind the customer to that org.
--
-- * signup_request / sms_request_send: new 4-argument overloads (p_code required, no default, so
--   PostgREST resolves each call shape unambiguously); the 3-argument versions now call them with
--   no code, so code from before this deploy keeps working.
-- * grant_credits (the signup gift): the 2024 partner allowance also applies when the account has
--   a code staged at its first sign-in that is an org staff code (signup_code_stage, called by the
--   app just before the gift; single use, at most an hour old, only before any gift), or a
--   sign-up redemption refused for the missing gift whose code is one (the 2026 catch-up).
--
-- Expand-only: new functions, a new private table, and create or replace of grant_credits (2026
-- body plus the marked lines) and of the two 3-argument functions with their signatures.

create function public._org_staff_code(p_code text, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_code collate "C" ~ '^[A-Za-z0-9]{4,20}$' and exists (
    select 1 from public.codes c
      join public.org_members m on m.user_id = c.owner_user_id and m.status = 'active'
      join public.orgs o on o.id = m.org_id and o.status = 'active' and o.affiliate_enabled
      join public.affiliates a on a.org_id = o.id and a.status = 'active'
      join public.affiliate_settings s on s.singleton and s.enabled
      -- As redeem_code: a banned owner's code is expired, and a full one cannot be redeemed.
      join public.profiles owner on owner.id = c.owner_user_id and owner.banned_at is null
     where c.code = upper(p_code) and c.kind = 'invite' and c.active
       and (c.max_redemptions is null or c.redemption_count < c.max_redemptions)
       and (c.starts_at is null or c.starts_at <= now()) and (c.expires_at is null or c.expires_at > now())
       and (p_user is null or (
         a.user_id <> p_user
         and not exists (select 1 from public.org_members x where x.org_id = o.id and x.user_id = p_user and x.status = 'active')
         and exists (select 1 from public.profiles p where p.id = p_user and (p.referred_by is null or p.referred_by = a.user_id))))), false)
$$;
revoke all on function public._org_staff_code(text, uuid) from public, anon, authenticated;
-- signup_request and sms_request_send run as the caller (service_role), as for _signup_org_ref.
grant execute on function public._org_staff_code(text, uuid) to service_role;

-- The code a first verified sign-in is about to redeem, staged just before the signup gift.
create table public.signup_code_staged (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9]{4,20}$'),
  created_at timestamptz not null default now()
);
alter table public.signup_code_staged enable row level security;
revoke all on table public.signup_code_staged from public, anon, authenticated, service_role;

-- Stages (or, with null, clears) the account's sign-up code. Only for an account with no signup
-- gift yet; true when stored.
create function public.signup_code_stage(p_user uuid, p_code text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null then return false; end if;
  delete from public.signup_code_staged where user_id = p_user;
  if p_code is null or p_code collate "C" !~ '^[A-Z0-9]{4,20}$'
     or exists (select 1 from public.credit_ledger where idempotency_key = 'signup:' || p_user::text)
     or not exists (select 1 from public.profiles where id = p_user) then
    return false;
  end if;
  insert into public.signup_code_staged (user_id, code) values (p_user, p_code);
  return true;
end;
$$;
revoke all on function public.signup_code_stage(uuid, text) from public, anon, authenticated;
grant execute on function public.signup_code_stage(uuid, text) to service_role;

-- The signup gift's channel test for staff codes (grant_credits).
create function public._signup_staff_code_channel(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.signup_code_staged g
                  where g.user_id = p_user and g.created_at > now() - interval '1 hour'
                    and public._org_staff_code(g.code, p_user))
      or exists (select 1 from public.code_redemptions r join public.codes c on c.id = r.code_id
                  where r.user_id = p_user and r.kind = 'invite' and r.status = 'blocked_no_signup_grant'
                    and r.context = 'signup' and public._org_staff_code(c.code, p_user))
$$;
revoke all on function public._signup_staff_code_channel(uuid) from public, anon, authenticated, service_role;

create function public.signup_request(p_email_key text, p_ip inet, p_ref_slug text, p_code text) returns text
language plpgsql set search_path = '' as $_$
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
    -- 2031: or an org staff member's invite code typed at this sign-up.
    if public._signup_org_ref(p_ref_slug) or public._org_staff_code(p_code, null) then
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
$_$;
revoke all on function public.signup_request(text, inet, text, text) from public, anon, authenticated;
grant execute on function public.signup_request(text, inet, text, text) to service_role;

create or replace function public.signup_request(p_email_key text, p_ip inet, p_ref_slug text) returns text
language sql set search_path = '' as $$
  select public.signup_request(p_email_key, p_ip, p_ref_slug, null::text)
$$;

create function public.sms_request_send(p_phone_key text, p_ip inet, p_ref_slug text, p_code text) returns text
language plpgsql set search_path = '' as $_$
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
    -- 2031: or an org staff member's invite code typed at this sign-up.
    v_org := public._signup_org_ref(p_ref_slug) or public._org_staff_code(p_code, null);
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
$_$;
revoke all on function public.sms_request_send(text, inet, text, text) from public, anon, authenticated;
grant execute on function public.sms_request_send(text, inet, text, text) to service_role;

create or replace function public.sms_request_send(p_phone_key text, p_ip inet, p_ref_slug text) returns text
language sql set search_path = '' as $$
  select public.sms_request_send(p_phone_key, p_ip, p_ref_slug, null::text)
$$;

create or replace function public.grant_credits(p_user_id uuid, p_amount integer, p_reason text, p_idempotency_key text, p_pool text)
returns public.credit_change language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.profiles;
  v_today jsonb;
  v_per_ip integer;
  v_partner integer;
  v_change public.credit_change;
  v_since timestamptz;
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
      -- 2026: except 'daily_cap', which is pending and decided again below (never for a banned
      -- account).
      if v_profile.signup_gift_refusal is not null
         and (v_profile.signup_gift_refusal <> 'daily_cap' or v_profile.banned_at is not null) then
        return row(false, v_profile.credits, v_profile.free_credits, v_profile.paid_until)::public.credit_change;
      end if;

      v_per_ip := public.signup_gift_setting_int('signup_gift_per_ip', 5);
      -- 2024: an account already bound through an org account's ?ref link at this sign-in gets the
      -- partner allowance; never stricter than the site-wide one (0 = no limit wins).
      -- 2031: or a sign-up through an org staff member's invite code: the code staged at this first
      -- sign-in, or a sign-up redemption refused for the missing gift (a later catch-up).
      if (v_profile.referred_source = 'signup' and exists (
           select 1 from public.affiliates a join public.orgs o on o.id = a.org_id
            where a.user_id = v_profile.referred_by and a.status = 'active'
              and o.status = 'active' and o.affiliate_enabled))
         or public._signup_staff_code_channel(p_user_id) then
        v_partner := public.signup_gift_setting_int('signup_gift_per_ip_partner', 20);
        v_per_ip := case when v_per_ip = 0 or v_partner = 0 then 0 else greatest(v_per_ip, v_partner) end;
      end if;
      if v_profile.signup_ip is not null and v_per_ip > 0 then
        -- 2026: a pending 'daily_cap' account is counted over the 24 hours before now, as a new
        -- sign-up paid now would be; a new sign-up keeps 1480's window (its created_at is now).
        v_since := case when v_profile.signup_gift_refusal = 'daily_cap' then now() else v_profile.created_at end
                   - interval '24 hours';
        perform pg_advisory_xact_lock(hashtextextended('shotviva.signup_ip:' || host(v_profile.signup_ip), 0));
        if (select count(*)
              from public.profiles other
              join public.credit_ledger l on l.idempotency_key = 'signup:' || other.id::text
             where other.signup_ip = v_profile.signup_ip
               and other.id <> p_user_id
               and l.created_at > v_since) >= v_per_ip then
          update public.profiles set signup_gift_refusal = 'same_ip_pending' where id = p_user_id;
          return row(false, v_profile.credits, v_profile.free_credits, v_profile.paid_until)::public.credit_change;
        end if;
      end if;

      -- One gift at a time site-wide, so concurrent sign-ups cannot all pass the count.
      perform pg_advisory_xact_lock(hashtextextended('shotviva.signup_gift_cap', 0));
      v_today := public.signup_gift_today();
      if (v_today->>'paused')::boolean then
        -- 2026: a pending 'daily_cap' account waits out the pause; a new one is refused for good.
        update public.profiles set signup_gift_refusal = 'paused'
         where id = p_user_id and signup_gift_refusal is null;
        return row(false, v_profile.credits, v_profile.free_credits, v_profile.paid_until)::public.credit_change;
      end if;
      if (v_today->>'granted')::integer >= (v_today->>'cap')::integer then
        update public.profiles set signup_gift_refusal = 'daily_cap' where id = p_user_id;
        return row(false, v_profile.credits, v_profile.free_credits, v_profile.paid_until)::public.credit_change;
      end if;

      v_change := public._apply_credit_change(p_user_id, p_pool, 'grant', p_amount, p_reason, p_idempotency_key);
      if v_change.applied then
        -- 2026: a caught-up account is no longer pending.
        if v_profile.signup_gift_refusal = 'daily_cap' then
          update public.profiles set signup_gift_refusal = null where id = p_user_id;
        end if;
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
