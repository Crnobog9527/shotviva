-- Invite codes are for sign-up only (ARCHITECTURE §6.4, Owner decision 2026-11-27, item 9).
--
-- redeem_code used to accept an invite code later too: from the account page or the paywall
-- (context 'account' / 'paywall') within the 7-day window, if the account had no payment. Now an
-- invite code is redeemable only in context 'signup' (the first verified sign-in, which redeems
-- the code typed in the sign-up form or carried by a ?code= link). Other contexts get
-- status 'new_users_only' with reason 'signup_only' and nothing is written: no redemption row, no
-- credits, no org binding. Campaign codes (gift / discount, including new_users_only ones) are
-- redeemable from every context as before. A customer who signed up without the partner's link or
-- code is bound by an admin instead (admin_affiliate_rebind).
--
-- The 7-day window and the "no payment yet" check stay in the function for the signup context,
-- where they cannot trigger for a just-created account; the late-entry path they guarded is gone.
-- The refusal comes before 'full' and the invite checks, after banned / expired / own / used.
--
-- With no later entry, the code typed at sign-up must not be lost when the confirmation email is
-- opened on another device or in a mail app's browser (review on #977): it used to live only in
-- the sv_code cookie of the browser that submitted the form. The email sign-up now also stores it
-- server-side, in signup_code_refs, and the first verified sign-in takes it once, with exactly
-- the safeguards 2021 uses for the partner link (affiliate_signup_refs):
--   * every successful sign-up form for the address replaces or clears the row; only an account
--     the Auth API has just created (<= 10 minutes, unconfirmed, never signed in) gets one;
--   * take deletes it (single use) and returns it only if it was written after the latest
--     confirmation email, no password-reset or email-change email came after it, the account has
--     no identity other than email, and it is under a day old (by the row's server time);
--   * the app lets it stand in for the cookie only on the click of the signup confirmation link,
--     and takes it (unused) on any other first verification; this browser's cookie wins.
--
-- Expand-only: create or replace with the same signature; body = 2025 plus the marked lines. The
-- reported status already exists, so code from before this deploy keeps working (it shows its
-- "new accounts only" message); the reason field is new and only read by the new code. The table
-- and its two functions are new.

create or replace function public.redeem_code(
  p_user uuid, p_code text, p_context text, p_invitee_credits int, p_invite_window_days int,
  p_replace boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  offer record;
  profile record;
  inviter record;
  pending record;
  prior_status text;
  prior_at timestamptz;
  owner_id uuid;
  redemption_id uuid := gen_random_uuid();
  checked_at timestamptz;
  deadline timestamptz;
  grant_pool text;
  credits int;
  outcome text := 'ok';
  replaced boolean := false;
  org_code boolean := false;
begin
  if p_context is null or p_context not in ('signup','account','paywall')
     or p_invite_window_days is null or p_invite_window_days <= 0 then
    raise exception 'INVALID_INPUT';
  end if;

  if p_code is null or p_code collate "C" !~ '^[A-Za-z0-9]{4,20}$' then
    return jsonb_build_object('status', 'not_found');
  end if;
  select owner_user_id into owner_id from public.codes where code = upper(p_code);
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  -- Lock participants in a consistent order before the code. A reciprocal pair of invites
  -- also touches both profiles via FKs and the existing balance helper's FOR UPDATE.
  perform 1 from public.profiles where id in (p_user, owner_id) order by id for no key update;
  -- 2025: referred_by too (the org-code exemption).
  select banned_at, signup_ip, created_at, referred_by into profile from public.profiles where id = p_user;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  select id, kind, owner_user_id, invitee_credits, invitee_pool, active, starts_at, expires_at,
         max_redemptions, redemption_count, new_users_only, discount_percent, discount_products,
         discount_valid_days
    into offer from public.codes where code = upper(p_code) for no key update;
  if not found or offer.owner_user_id is distinct from owner_id then
    return jsonb_build_object('status', 'not_found');
  end if;

  checked_at := clock_timestamp();
  if profile.banned_at is not null then outcome := 'banned';
  elsif not offer.active or offer.starts_at > checked_at or offer.expires_at <= checked_at then outcome := 'expired';
  elsif offer.owner_user_id = p_user then outcome := 'own';
  -- 2025: only a successful redemption uses the code.
  elsif exists (select 1 from public.code_redemptions where code_id = offer.id and user_id = p_user and status = 'ok') then outcome := 'used';
  -- 2030: an invite code is only redeemable at sign-up (the first verified sign-in).
  elsif offer.kind = 'invite' and p_context <> 'signup' then outcome := 'signup_only';
  elsif offer.redemption_count >= offer.max_redemptions then outcome := 'full';
  elsif (offer.new_users_only or offer.kind = 'invite')
    and profile.created_at + make_interval(days => p_invite_window_days) <= checked_at then outcome := 'new_users_only';
  elsif offer.kind = 'invite' then
    select signup_ip, banned_at into inviter from public.profiles where id = offer.owner_user_id;
    -- 2025: a code that binds the customer to the org (the org_l1 branch of _org_attribute_invite).
    org_code := exists (select from public.org_members m
      join public.orgs o on o.id = m.org_id
      join public.affiliates a on a.org_id = o.id
      where m.user_id = offer.owner_user_id and m.status = 'active' and o.status = 'active' and o.affiliate_enabled
        and a.status = 'active' and a.user_id <> p_user
        and (profile.referred_by is null or profile.referred_by = a.user_id)
        and not exists (select from public.org_members c
          where c.org_id = o.id and c.user_id = p_user and c.status = 'active'));
    if inviter.banned_at is not null then outcome := 'expired';
    -- 2025: only a successful invite counts.
    elsif exists (select 1 from public.code_redemptions where user_id = p_user and kind = 'invite' and status = 'ok') then outcome := 'already_invited';
    elsif exists (select 1 from public.payments where user_id = p_user) then outcome := 'new_users_only';
    elsif inviter.signup_ip = profile.signup_ip and not org_code then outcome := 'blocked_same_ip';
    elsif not exists (select 1 from public.credit_ledger l
      where l.idempotency_key = 'signup:' || p_user and l.user_id = p_user and l.kind = 'grant' and l.pool = 'free') then
      outcome := 'blocked_no_signup_grant';
    end if;
  end if;

  -- 2030: reported as new_users_only, so code from before this deploy shows its usual refusal; the
  -- reason tells the current code to say that invite codes are for sign-up only. Nothing is written.
  if outcome = 'signup_only' then
    return jsonb_build_object('kind', offer.kind, 'status', 'new_users_only', 'reason', 'signup_only');
  end if;

  if outcome <> 'ok' then
    if outcome in ('blocked_same_ip', 'blocked_no_signup_grant') then
      -- 2025: the latest blocked attempt replaces an earlier one (one invite row per user).
      -- The replaced row moves to code_redemption_blocks, so the evidence stays.
      with gone as (
        delete from public.code_redemptions where user_id = p_user and kind = 'invite' and status <> 'ok'
        returning id, code_id, kind, user_id, inviter_user_id, context, status, created_at)
      insert into public.code_redemption_blocks(id, code_id, kind, user_id, inviter_user_id, context, status, created_at, replaced_by)
        select id, code_id, kind, user_id, inviter_user_id, context, status, created_at, redemption_id from gone;
      insert into public.code_redemptions(id, code_id, kind, user_id, inviter_user_id, context, status)
        values (redemption_id, offer.id, offer.kind, p_user, offer.owner_user_id, p_context, outcome);
    end if;
    return jsonb_build_object('kind', offer.kind, 'status', outcome);
  end if;

  if offer.discount_percent is not null then
    -- The user lock serializes simultaneous claims of different offers. An old Stripe
    -- session may still be payable after its campaign was paused or its offer expired.
    select r.id, c.code, c.active, c.starts_at, c.expires_at, r.discount_expires_at, r.checkout_expires_at
      into pending from public.code_redemptions r join public.codes c on c.id = r.code_id
      where r.user_id = p_user and r.discount_used_payment_id is null and r.discount_void_at is null
        and r.status = 'ok' and c.discount_percent is not null;
    if found then
      if pending.checkout_expires_at > checked_at then
        return jsonb_build_object('kind', offer.kind, 'status', 'checkout_in_progress');
      end if;
      replaced := pending.active and (pending.starts_at is null or pending.starts_at <= checked_at)
        and (pending.expires_at is null or pending.expires_at > checked_at)
        and (pending.discount_expires_at is null or pending.discount_expires_at > checked_at);
      if replaced and p_replace is not true then
        return jsonb_build_object('kind', offer.kind, 'status', 'needs_confirm', 'current_code', pending.code);
      end if;
      -- Void even a dormant offer so reactivating its campaign cannot resurrect two discounts.
      update public.code_redemptions set discount_void_at = checked_at where id = pending.id;
    end if;
    deadline := least(offer.expires_at, checked_at + make_interval(days => offer.discount_valid_days));
  end if;

  -- 2025: a successful invite replaces the user's blocked attempt (any invite code), keeping why
  -- and when it was blocked. A blocked row never granted credits.
  if offer.kind = 'invite' then
    with gone as (
      delete from public.code_redemptions where user_id = p_user and kind = 'invite' and status <> 'ok'
      returning id, code_id, kind, user_id, inviter_user_id, context, status, created_at)
    insert into public.code_redemption_blocks(id, code_id, kind, user_id, inviter_user_id, context, status, created_at, replaced_by)
      select id, code_id, kind, user_id, inviter_user_id, context, status, created_at, redemption_id from gone
      returning status, created_at into prior_status, prior_at;
  end if;

  credits := case when offer.kind = 'invite' then
    (select (value->>'inviteeCredits')::integer from public.system_settings where key = 'code_invite_rewards')
    else coalesce(offer.invitee_credits, 0) end;
  grant_pool := case when offer.kind = 'invite' then 'free' else offer.invitee_pool end;
  insert into public.code_redemptions
    (id, code_id, kind, user_id, inviter_user_id, context, status, credits_granted, discount_expires_at,
     blocked_status, blocked_at)
    values (redemption_id, offer.id, offer.kind, p_user, offer.owner_user_id, p_context, 'ok', credits, deadline,
     prior_status, prior_at);
  update public.codes set redemption_count = redemption_count + 1 where id = offer.id;
  if credits > 0 then
    perform public._apply_credit_change(p_user, grant_pool, 'code_grant', credits, 'Code redemption', 'code:' || redemption_id);
  end if;
  return jsonb_build_object('status', 'ok', 'kind', offer.kind, 'credits_granted', credits, 'pool', grant_pool,
    'discount_percent', offer.discount_percent, 'discount_products', offer.discount_products,
    'discount_expires_at', deadline, 'replaced', replaced);
end;
$$;

create table public.signup_code_refs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9]{4,20}$'),
  created_at timestamptz not null default now()
);

alter table public.signup_code_refs enable row level security;
-- No direct access for anyone, service role included: only the two functions below.
revoke all on table public.signup_code_refs from public, anon, authenticated, service_role;

-- After a successful sign-up form for `p_user`: replaces its row with `p_code`, or clears it. true
-- when a row was stored (same rules as affiliate_signup_ref_store, 2021).
create function public.signup_code_store(p_user uuid, p_code text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null then return false; end if;
  delete from public.signup_code_refs where user_id = p_user;
  if p_code is null or p_code collate "C" !~ '^[A-Z0-9]{4,20}$' then return false; end if;
  perform 1 from auth.users u
   where u.id = p_user and u.email_confirmed_at is null and u.phone_confirmed_at is null
     and u.last_sign_in_at is null and u.created_at >= now() - interval '10 minutes';
  if not found then return false; end if;
  insert into public.signup_code_refs (user_id, code) values (p_user, p_code);
  return true;
end;
$$;

-- The stored code, removed as it is read; null when there is none or it no longer belongs to the
-- account's latest signup confirmation email (same rules as affiliate_signup_ref_take, 2021).
create function public.signup_code_take(p_user uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_code text; v_at timestamptz;
begin
  delete from public.signup_code_refs where user_id = p_user returning code, created_at into v_code, v_at;
  if v_code is null or v_at < now() - interval '1 day' then return null; end if;
  perform 1 from auth.users u
   where u.id = p_user and u.confirmation_sent_at <= v_at
     and (u.recovery_sent_at is null or u.recovery_sent_at < v_at)
     and (u.email_change_sent_at is null or u.email_change_sent_at < v_at)
     and not exists (select 1 from auth.identities i where i.user_id = p_user and i.provider <> 'email');
  if not found then return null; end if;
  return v_code;
end;
$$;

revoke execute on function public.signup_code_store(uuid, text) from public, anon, authenticated;
revoke execute on function public.signup_code_take(uuid) from public, anon, authenticated;
grant execute on function public.signup_code_store(uuid, text) to service_role;
grant execute on function public.signup_code_take(uuid) to service_role;
