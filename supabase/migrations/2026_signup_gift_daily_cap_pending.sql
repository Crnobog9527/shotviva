-- A signup gift refused for the daily cap is pending, not final (ARCHITECTURE §7; Owner
-- 2026-11-27). Until now grant_credits stored signup_gift_refusal = 'daily_cap' and every later
-- call returned at once: an account that signed up after that Beijing day's signup_gift_daily_cap
-- was reached never got its gift.
--
-- Now a 'daily_cap' account is paid on a later day, in two ways, both through grant_credits'
-- signup branch with the same 'signup:<user>' key and amount rule (signup_gift_amount(created_at)),
-- so it can be paid once only:
-- * its next verified sign-in (core/auth/first-sign-in.ts already calls grant_credits on every
--   one), and
-- * signup_gift_catch_up, run daily by /api/cron/signup-gift-catch-up just after the Beijing day
--   starts: oldest sign-ups first, at most p_limit (the route asks for 50) per run.
-- A catch-up is decided by every rule as of the moment it is paid: the pause stops it (the
-- refusal stays 'daily_cap', still pending); the per-network allowance is counted again under the
-- same lock (an account over it now becomes 'same_ip_pending', which a phone or Google claim
-- pays); and it counts against the cap of the day it is paid, under the same cap lock. Catch-ups
-- share that day's cap with new sign-ups, with no reservation either way: the cron pays the oldest
-- pending accounts first when the day opens (at most 50), new sign-ups and sign-in retries take
-- what is left. A banned account is never paid, and a deleted one has no profile left to find.
-- 'paused' stays final (the pause is the emergency stop; paying everyone who signed up during it
-- once it is lifted would undo it), as do 'staff' and 'same_ip' handling (claim_signup_gift).
-- The org signup bonus follows a catch-up as it follows any gift grant_credits pays (2024 calls
-- 2023's _org_signup_bonus_after_gift).
--
-- Expand-only: create or replace of grant_credits (2024's body; the same signature and result),
-- one new service-role function and a partial index. The code running before the deploy keeps
-- working: its sign-ins now also pay a pending 'daily_cap' account when the day has room, and
-- without the cron nothing else runs.

create index if not exists profiles_signup_gift_daily_cap_idx
  on public.profiles (created_at, id) where signup_gift_refusal = 'daily_cap';

-- grant_credits: 2024's body; a stored 'daily_cap' no longer stops the signup branch.
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
      -- 2026: except 'daily_cap', which is pending and decided again below (never for a banned
      -- account).
      if v_profile.signup_gift_refusal is not null
         and (v_profile.signup_gift_refusal <> 'daily_cap' or v_profile.banned_at is not null) then
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

-- The daily catch-up: pays pending 'daily_cap' accounts, oldest sign-up first, through
-- grant_credits (so every rule, lock and the ledger key are the signup branch's), until p_limit
-- accounts were tried, today's cap is reached or the gift is paused. An account whose grant fails
-- is skipped and counted; the next run retries it. 'remaining' is the queue left after this run.
create function public.signup_gift_catch_up(p_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_today jsonb;
  v_change public.credit_change;
  v_paid integer := 0;
  v_tried integer := 0;
  v_failed integer := 0;
  v_stopped text := null;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'INVALID_INPUT' using detail = 'limit must be from 1 to 500';
  end if;

  for v_user in
    select p.id from public.profiles p
     where p.signup_gift_refusal = 'daily_cap' and p.banned_at is null
       and public.signup_gift_amount(p.created_at) > 0
       and not exists (select 1 from public.credit_ledger l where l.idempotency_key = 'signup:' || p.id::text)
     order by p.created_at, p.id
     limit p_limit
  loop
    v_today := public.signup_gift_today();
    if (v_today->>'paused')::boolean then
      v_stopped := 'paused';
      exit;
    end if;
    if (v_today->>'granted')::integer >= (v_today->>'cap')::integer then
      v_stopped := 'daily_cap';
      exit;
    end if;
    v_tried := v_tried + 1;
    begin
      v_change := public.grant_credits(v_user, 1, 'signup', 'signup:' || v_user::text, 'free');
      if v_change.applied then
        v_paid := v_paid + 1;
      end if;
    exception when others then
      v_failed := v_failed + 1;
    end;
  end loop;

  return jsonb_build_object(
    'paid', v_paid,
    'tried', v_tried,
    'failed', v_failed,
    'stopped', v_stopped,
    'remaining', (select count(*) from public.profiles p
                   where p.signup_gift_refusal = 'daily_cap' and p.banned_at is null
                     and public.signup_gift_amount(p.created_at) > 0
                     and not exists (select 1 from public.credit_ledger l where l.idempotency_key = 'signup:' || p.id::text)));
end;
$$;
revoke all on function public.signup_gift_catch_up(integer) from public, anon, authenticated;
grant execute on function public.signup_gift_catch_up(integer) to service_role;
