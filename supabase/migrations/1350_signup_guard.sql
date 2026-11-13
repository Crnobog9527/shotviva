-- Sign-up without a visible captcha (ARCHITECTURE §7). hCaptcha is switched off; what keeps bots
-- from farming the signup gift is now three things, all in this file:
--
--   1. A daily cap on signup gifts, per Beijing day (system_settings signup_gift_daily_cap,
--      default 30), and a pause switch (signup_gift_paused, default off). Checked inside the
--      signup branch of grant_credits under one global lock, so the cap holds however many
--      accounts verify at once. Whatever the attacker has, the gift costs at most cap a day.
--   2. A refusal is final: profiles.signup_gift_refusal records why ('same_ip', 'daily_cap',
--      'paused'), and a later sign-in never pays that account. The account page reads it.
--   3. Email sign-ups must come through our server: signup_request() is called by the sign-up
--      server action with the visitor's real IP (5 an hour, 20 a day per IP), and the Before
--      User Created auth hook (hook_before_user_created) refuses an email account with no
--      request in the last 10 minutes, and a phone account with no SMS request (sms_sends,
--      0440) in the last 10 minutes. A script calling the Auth API directly gets nothing.
--      Google and other OAuth accounts pass: the provider already did its own checks.
--      Admin-created users (auth.admin.createUser) never reach the hook.
--
-- The hook only runs once the Owner enables it in the Supabase dashboard (Authentication →
-- Hooks); turning it off there is the rollback. Without it the cap still holds.

-- 1. Why an account got no signup gift. Null: not refused (granted, or not yet tried).
alter table public.profiles
  add column signup_gift_refusal text check (signup_gift_refusal in ('same_ip', 'daily_cap', 'paused'));

-- Today's signup gifts, counted under the cap lock.
create index credit_ledger_signup_created_at_idx on public.credit_ledger (created_at)
  where kind = 'grant' and reason = 'signup';

-- The start of the current Beijing day, as the admin test budget counts it (0783).
create function public.signup_gift_day_start()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select date_trunc('day', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai'
$$;

revoke execute on function public.signup_gift_day_start() from public, anon, authenticated;
grant execute on function public.signup_gift_day_start() to service_role;

-- Today's count, the cap and the switch, for the Owner alert and the admin card. Missing or
-- malformed settings read as their defaults (30, not paused), the same as grant_credits.
create function public.signup_gift_today()
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
    'cap', coalesce((select case when jsonb_typeof(s.value) = 'number' and (s.value #>> '{}') ~ '^[0-9]+$'
                                 then (s.value #>> '{}')::integer end
                       from public.system_settings s where s.key = 'signup_gift_daily_cap'), 30),
    'paused', coalesce((select case when jsonb_typeof(s.value) = 'boolean' then (s.value #>> '{}')::boolean end
                          from public.system_settings s where s.key = 'signup_gift_paused'), false)
  )
$$;

revoke execute on function public.signup_gift_today() from public, anon, authenticated;
grant execute on function public.signup_gift_today() to service_role;

-- grant_credits: 0963's body, with the stored refusal, the pause and the daily cap added to the
-- signup branch. Lock order is unchanged up to the same-IP lock; the cap lock comes last, and
-- is only taken by an account that is about to be paid.
create or replace function public.grant_credits(p_user_id uuid, p_amount integer, p_reason text, p_idempotency_key text, p_pool text)
returns public.credit_change
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  cutoff timestamptz;
  v_today jsonb;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_INPUT' using detail = 'amount must be positive';
  end if;

  if p_idempotency_key = 'signup:' || p_user_id::text then
    perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.template_catalog',0));
    lock table public.profiles in row exclusive mode;
    select * into v_profile from public.profiles where id = p_user_id;
    -- Read the committed version, not the app bundle: a stale tab must not award six
    -- old credits after cutover, nor may an old account claim a second registration gift.
    select updated_at into cutoff from public.system_settings
     where key='pricing_catalog_version' and value='"v2"'::jsonb;
    if cutoff is not null then
      if v_profile.created_at < cutoff then
        return row(false,v_profile.credits,v_profile.free_credits,v_profile.paid_until)::public.credit_change;
      end if;
      p_amount := 100;
    else
      p_amount := 6;
    end if;

    -- Already paid: the ledger's idempotency key makes this a no-op; never refuse it now.
    if not exists (select 1 from public.credit_ledger where idempotency_key = p_idempotency_key) then
      if v_profile.signup_gift_refusal is not null then
        return row(false, v_profile.credits, v_profile.free_credits, v_profile.paid_until)::public.credit_change;
      end if;

      if v_profile.signup_ip is not null then
        perform pg_advisory_xact_lock(hashtextextended('shotviva.signup_ip:' || host(v_profile.signup_ip), 0));
        if exists (
             select 1
               from public.profiles other
               join public.credit_ledger l on l.idempotency_key = 'signup:' || other.id::text
              where other.signup_ip = v_profile.signup_ip
                and other.id <> p_user_id
                and l.created_at > v_profile.created_at - interval '24 hours'
           ) then
          update public.profiles set signup_gift_refusal = 'same_ip' where id = p_user_id;
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
    end if;
  end if;

  return public._apply_credit_change(p_user_id, p_pool, 'grant', p_amount, p_reason, p_idempotency_key);
end;
$$;

-- admin_set_system_setting: 1201's body with the two signup gift keys added. Like the gift code
-- keys they spend credits, so a banned admin cannot save them.
--   signup_gift_daily_cap  integer 0..100000  signup gifts per Beijing day (default 30; 0 = none)
--   signup_gift_paused     boolean            no signup gifts at all while on (default off)
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
                         'signup_gift_daily_cap','signup_gift_paused')
           or p.banned_at is null)) then
    raise exception 'NOT_ADMIN';
  end if;

  case p_key
    when 'wishlist_enabled', 'gallery_enabled', 'gallery_auto_approve', 'signup_gift_paused' then
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

-- 3. Email sign-up requests, one row per sign-up form the server accepted. email_key is the
-- sha256 hex of the lower-cased address (computed in the app and again in the hook); the
-- address itself is not stored. Rows are needed for 24 hours; signup_request deletes those
-- older than two days. Private: RLS on with no policy, reached only through the functions.
create table public.signup_requests (
  id bigint generated always as identity primary key,
  email_key text not null check (email_key ~ '^[0-9a-f]{64}$'),
  ip inet,
  requested_at timestamptz not null default now()
);

create index signup_requests_email_key_requested_at_idx on public.signup_requests (email_key, requested_at desc);
create index signup_requests_ip_requested_at_idx on public.signup_requests (ip, requested_at desc) where ip is not null;
create index signup_requests_requested_at_idx on public.signup_requests (requested_at);

alter table public.signup_requests enable row level security;

revoke all on public.signup_requests from public, anon, authenticated;
grant select, insert, delete on public.signup_requests to service_role;

-- The sign-up server action, before it calls Supabase signUp. Per IP: 5 an hour, 20 a day.
-- Answers 'ok' | 'ip_hourly' | 'ip_daily'. A null IP (local dev) is not counted.
create function public.signup_request(p_email_key text, p_ip inet)
returns text
language plpgsql
set search_path = ''
as $$
begin
  if p_email_key is null or p_email_key !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_INPUT' using detail = 'email_key must be a sha256 hex digest';
  end if;
  if p_ip is not null then
    perform pg_advisory_xact_lock(hashtextextended('signup:ip:' || host(p_ip), 0));
    if (select count(*) from public.signup_requests r
         where r.ip = p_ip and r.requested_at > now() - interval '1 hour') >= 5 then
      return 'ip_hourly';
    end if;
    if (select count(*) from public.signup_requests r
         where r.ip = p_ip and r.requested_at > now() - interval '24 hours') >= 20 then
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

revoke execute on function public.signup_request(text, inet) from public, anon, authenticated;
grant execute on function public.signup_request(text, inet) to service_role;

-- The Before User Created auth hook (Postgres function). '{}' lets Supabase create the account;
-- an error object refuses it with that status. Security definer: Supabase Auth calls it as
-- supabase_auth_admin, which cannot read our private tables.
create function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user jsonb := event->'user';
  v_provider text := v_user->'app_metadata'->>'provider';
  v_email text := lower(trim(coalesce(v_user->>'email', '')));
  v_phone text := regexp_replace(coalesce(v_user->>'phone', ''), '[^0-9]', '', 'g');
  v_refused jsonb := jsonb_build_object('error', jsonb_build_object(
    'http_code', 403, 'message', 'Please sign up on the website.'));
begin
  if v_provider = 'email' then
    if v_email = '' or not exists (
         select 1 from public.signup_requests r
          where r.email_key = encode(sha256(convert_to(v_email, 'UTF8')), 'hex')
            and r.requested_at > now() - interval '10 minutes') then
      return v_refused;
    end if;
  elsif v_provider = 'phone' then
    if v_phone = '' or not exists (
         select 1 from public.sms_sends s
          where s.phone_key = encode(sha256(convert_to(v_phone, 'UTF8')), 'hex')
            and s.requested_at > now() - interval '10 minutes') then
      return v_refused;
    end if;
  end if;
  return '{}'::jsonb;
end;
$$;

revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
