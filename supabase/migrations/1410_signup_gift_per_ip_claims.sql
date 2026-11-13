-- Signup gift: a per-network allowance instead of one gift per network, and a way for the
-- accounts over it to claim the gift later (ARCHITECTURE §7). Owner, 2026-11-13: offices, campus
-- and home broadband share one exit IP, and the Owner signs friends up on his own phone, so
-- "one gift per network per 24 hours" (0184, 1350) refused real people.
--
--   1. signup_gift_per_ip (system_settings, default 5, 0 = no limit): how many signup gifts one
--      signup IP may receive in 24 hours. Checked in grant_credits under the per-IP lock, so it
--      holds however many accounts from that network verify at once.
--   2. An account over that allowance is no longer refused for good. Its refusal is
--      'same_ip_pending', and claim_signup_gift() pays it once the account proves a scarcer
--      identity: a verified phone number or a linked Google account. Each phone number and each
--      Google account pays one signup gift ever (signup_gift_claims keeps only a sha256 of it,
--      also after the account is deleted). Which methods count is in the admin
--      (signup_gift_claim_phone, signup_gift_claim_google, both default on).
--   3. The daily cap and the pause (1350) still apply at claim time, but they do not end the
--      claim: the account stays pending and can try again. 'daily_cap' and 'paused' refusals at
--      sign-up stay final, as before.
--   4. Every same-IP refusal so far is pending too, so those accounts can claim: 'same_ip'
--      (1350) and the older ones that stored no reason (0184: an IP, no signup row). Read that
--      way here and in the app rather than rewritten, so the deployed code never sees new rows.

-- 1. The new refusal. 'same_ip' stays valid for the rows 1350 wrote; nothing writes it any more.
alter table public.profiles drop constraint profiles_signup_gift_refusal_check;
alter table public.profiles
  add constraint profiles_signup_gift_refusal_check
  check (signup_gift_refusal in ('same_ip', 'same_ip_pending', 'daily_cap', 'paused'));

-- 2. One signup gift per phone number and per Google account, ever. key_hash is
-- sha256(phone digits as auth.users stores them, '8614000005678') for a phone, the same key as
-- sms_sends (0440), and sha256('google:' || the Google account id) for Google. user_id is cleared
-- when the account is deleted; the row stays, so deleting and coming back pays nothing twice.
create table public.signup_gift_claims (
  key_hash text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  method text not null check (method in ('phone', 'google')),
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.signup_gift_claims enable row level security;
revoke all on table public.signup_gift_claims from public, anon, authenticated;
grant select, insert on table public.signup_gift_claims to service_role;

-- 3. Settings. Missing or malformed rows read as their defaults.
create function public.signup_gift_setting_int(p_key text, p_default integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select case when jsonb_typeof(s.value) = 'number' and (s.value #>> '{}') ~ '^[0-9]+$'
                               then (s.value #>> '{}')::integer end
                     from public.system_settings s where s.key = p_key), p_default)
$$;

create function public.signup_gift_setting_bool(p_key text, p_default boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select case when jsonb_typeof(s.value) = 'boolean' then (s.value #>> '{}')::boolean end
                     from public.system_settings s where s.key = p_key), p_default)
$$;

revoke execute on function public.signup_gift_setting_int(text, integer) from public, anon, authenticated;
revoke execute on function public.signup_gift_setting_bool(text, boolean) from public, anon, authenticated;
grant execute on function public.signup_gift_setting_int(text, integer) to service_role;
grant execute on function public.signup_gift_setting_bool(text, boolean) to service_role;

-- Today's count and every signup gift setting, for the admin card and the Owner alert. 1350's
-- three keys keep their meaning; readers that only know them ignore the rest.
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
    'claim_google', public.signup_gift_setting_bool('signup_gift_claim_google', true)
  )
$$;

-- What the signup gift is worth for an account created at p_created_at: 0 before the pricing
-- cutover (an old account never claims a second registration gift), 100 after it, 6 before any
-- cutover exists. Read from the committed setting, as grant_credits did inline (0963).
create function public.signup_gift_amount(p_created_at timestamptz)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when cutoff is null then 6
           when p_created_at < cutoff then 0
           else 100
         end
    from (select (select s.updated_at from public.system_settings s
                   where s.key = 'pricing_catalog_version' and s.value = '"v2"'::jsonb) as cutoff) c
$$;

revoke execute on function public.signup_gift_amount(timestamptz) from public, anon, authenticated;
grant execute on function public.signup_gift_amount(timestamptz) to service_role;

-- The phone and Google keys an account holds right now: a confirmed phone on the account, and
-- its Google identities. Only what Supabase Auth itself verified counts.
create function public.signup_gift_identity_keys(p_user_id uuid)
returns table (method text, key_hash text)
language sql
stable
security definer
set search_path = ''
as $$
  select 'phone', encode(sha256(convert_to(u.phone, 'UTF8')), 'hex')
    from auth.users u
   where u.id = p_user_id and coalesce(u.phone, '') <> '' and u.phone_confirmed_at is not null
  union all
  select 'google', encode(sha256(convert_to('google:' || i.provider_id, 'UTF8')), 'hex')
    from auth.identities i
   where i.user_id = p_user_id and i.provider = 'google'
$$;

revoke execute on function public.signup_gift_identity_keys(uuid) from public, anon, authenticated;
grant execute on function public.signup_gift_identity_keys(uuid) to service_role;

-- grant_credits: 1350's body. The same-IP rule now counts against signup_gift_per_ip and leaves
-- the account pending instead of refused; a gift that is paid records the account's phone and
-- Google keys, so they cannot pay a second account through a claim. Lock order is unchanged:
-- template catalog (shared), the signup IP, then the cap.
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
      end if;
      return v_change;
    end if;
  end if;

  return public._apply_credit_change(p_user_id, p_pool, 'grant', p_amount, p_reason, p_idempotency_key);
end;
$$;

-- claim_signup_gift: pays the signup gift to an account the per-network allowance left pending,
-- once it holds a phone or Google key no other signup gift used. p_method picks one ('phone' or
-- 'google'); null tries every enabled one (the app calls that after each verified sign-in, so a
-- phone or Google sign-up over the allowance is paid straight away). Answers, as text:
--   granted        paid now
--   not_pending    nothing to claim: already paid, refused for good, or never owed
--   method_off     the admin switched that method off (or every method, for null)
--   no_identity    the account has no confirmed phone / no Google identity for the method
--   already_used   that phone or Google account already paid a signup gift
--   paused, daily_cap   the gift is paused or today's cap is reached; still pending
-- Lock order: template catalog (shared), the cap, then the profile row. grant_credits takes the
-- profile row only after the cap, so the two never wait on each other the other way round.
create function public.claim_signup_gift(p_user_id uuid, p_method text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_amount integer;
  v_today jsonb;
  v_key record;
  v_enabled boolean := false;
  v_change public.credit_change;
begin
  if p_user_id is null or (p_method is not null and p_method not in ('phone', 'google')) then
    raise exception 'INVALID_INPUT' using detail = 'unknown claim method';
  end if;

  perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.template_catalog', 0));
  perform pg_advisory_xact_lock(hashtextextended('shotviva.signup_gift_cap', 0));
  select * into v_profile from public.profiles where id = p_user_id for update;
  -- Pending: over the allowance since 1410, a 1350 'same_ip', or an older same-IP refusal that
  -- stored nothing (an IP, no reason). Never paid already.
  if not found
     or not (coalesce(v_profile.signup_gift_refusal in ('same_ip_pending', 'same_ip'), false)
             or (v_profile.signup_gift_refusal is null and v_profile.signup_ip is not null))
     or exists (select 1 from public.credit_ledger where idempotency_key = 'signup:' || p_user_id::text) then
    return 'not_pending';
  end if;
  v_amount := public.signup_gift_amount(v_profile.created_at);
  if v_amount = 0 then
    return 'not_pending';
  end if;

  v_today := public.signup_gift_today();
  for v_key in
    select k.method, k.key_hash
      from public.signup_gift_identity_keys(p_user_id) k
     where p_method is null or k.method = p_method
     order by k.method desc  -- phone first
  loop
    if not (v_today->>('claim_' || v_key.method))::boolean then
      continue;
    end if;
    v_enabled := true;
    if exists (select 1 from public.signup_gift_claims c where c.key_hash = v_key.key_hash) then
      continue;
    end if;
    if (v_today->>'paused')::boolean then
      return 'paused';
    end if;
    if (v_today->>'granted')::integer >= (v_today->>'cap')::integer then
      return 'daily_cap';
    end if;

    insert into public.signup_gift_claims (key_hash, method, user_id) values (v_key.key_hash, v_key.method, p_user_id);
    update public.profiles set signup_gift_refusal = null where id = p_user_id;
    v_change := public._apply_credit_change(p_user_id, 'free', 'grant', v_amount, 'signup', 'signup:' || p_user_id::text);
    -- The account's other keys are spent too: one account, one gift, whatever it later links.
    insert into public.signup_gift_claims (key_hash, method, user_id)
    select k.key_hash, k.method, p_user_id from public.signup_gift_identity_keys(p_user_id) k
    on conflict (key_hash) do nothing;
    return 'granted';
  end loop;

  if not v_enabled then
    -- No enabled method with a key: say which is missing, the switch or the identity.
    if p_method is not null and not (v_today->>('claim_' || p_method))::boolean then
      return 'method_off';
    end if;
    if p_method is null and not (v_today->>'claim_phone')::boolean and not (v_today->>'claim_google')::boolean then
      return 'method_off';
    end if;
    return 'no_identity';
  end if;
  return 'already_used';
end;
$$;

revoke execute on function public.claim_signup_gift(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_signup_gift(uuid, text) to service_role;

-- admin_set_system_setting: 1350's body with the three new signup gift keys. They spend credits,
-- so a banned admin cannot save them either.
--   signup_gift_per_ip        integer 0..1000  signup gifts per signup IP per 24 hours (default 5; 0 = no limit)
--   signup_gift_claim_phone   boolean          a pending account may claim with a verified phone (default on)
--   signup_gift_claim_google  boolean          a pending account may claim with a Google account (default on)
create or replace function public.admin_set_system_setting(p_key text, p_value jsonb, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_actor is null then
    raise exception 'INVALID_INPUT' using detail = 'actor is required';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_actor and p.role = 'admin'
      and (p_key not in ('code_gift_policy','code_inviter_window_days','gallery_enabled','gallery_auto_approve',
                         'signup_gift_daily_cap','signup_gift_paused','signup_gift_per_ip',
                         'signup_gift_claim_phone','signup_gift_claim_google')
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
$$;

revoke execute on function public.admin_set_system_setting(text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.admin_set_system_setting(text, jsonb, uuid) to service_role;
