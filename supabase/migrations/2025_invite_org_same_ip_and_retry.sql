-- Invite codes (ARCHITECTURE §6.4 / §6.5), Owner decisions 2026-11-27:
--
-- 1. An org staff member's invite code is exempt from the same-IP block. Salespeople sign
--    customers up on the customer's (or their own shop's) network, so the staff member and the
--    customer often share signup_ip. 1844 / 2022 already dropped the same_ip commission flag for
--    org customers; the invite itself was still refused (blocked_same_ip). The exemption applies
--    exactly when the redemption would bind the customer to the org (the org_l1 branch of
--    _org_attribute_invite, 1680): the code's owner is an active member of an active org whose
--    affiliate switch is on and whose org account is active, the customer is not an active member
--    of that org nor the account itself, and the customer is unbound or already bound to that org
--    account. Personal invite codes (including an org customer's own code, the org_l2 path) keep
--    the block. The signup-gift requirement (blocked_no_signup_grant) is unchanged for everyone,
--    so the per-network gift limits still decide whether the customer gets free credits at all.
--
-- 2. A blocked attempt no longer burns the code. A blocked_same_ip / blocked_no_signup_grant row
--    used to make every later attempt return 'used' (same code) or 'already_invited' (any other
--    invite code), so a customer whose gift arrived later (claimed on another network, or paid
--    after a pending cap) could never be invited. Now only an 'ok' row counts as used / invited.
--    A later attempt that passes replaces the user's blocked row with the 'ok' row (keeping when
--    and why it was blocked in blocked_status / blocked_at); an attempt that is blocked again
--    replaces the old blocked row with the new one. The user's profile lock (taken first, as
--    before) serializes attempts, and the unique index on (user_id) where kind = 'invite' still
--    allows one invite row per user, so the invitee credits (code:<redemption>) and the inviter
--    reward (invite:<redemption>, only for 'ok' rows) are paid at most once. Blocked rows never
--    granted anything, and nothing references them (org_attribution_errors only gets 'ok' rows).
--
-- Expand-only: two nullable columns and create or replace of redeem_code with the same signature
-- (body as in 0980 apart from the marked lines). Code running before the deploy calls the same
-- function and reads the same statuses.

alter table public.code_redemptions
  add column blocked_status text check (blocked_status in ('blocked_same_ip','blocked_no_signup_grant')),
  add column blocked_at timestamptz;

comment on column public.code_redemptions.blocked_status is
  'For an ok invite row: the status of the blocked attempt it replaced (2025), else null.';

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

  if outcome <> 'ok' then
    if outcome in ('blocked_same_ip', 'blocked_no_signup_grant') then
      -- 2025: the latest blocked attempt replaces an earlier one (one invite row per user).
      delete from public.code_redemptions where user_id = p_user and kind = 'invite' and status <> 'ok';
      insert into public.code_redemptions(code_id, kind, user_id, inviter_user_id, context, status)
        values (offer.id, offer.kind, p_user, offer.owner_user_id, p_context, outcome);
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
    delete from public.code_redemptions where user_id = p_user and kind = 'invite' and status <> 'ok'
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
