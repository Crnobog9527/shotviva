-- Personal and org invite rewards do not overlap (ARCHITECTURE §6.4 / §6.5, Owner rule 2026-11-27).
--
-- A customer who signs up with an org staff member's invite code (the org_l1 branch, the same
-- org_code rule 2025 uses for the same-IP exemption) gets the signup gift and the org's signup
-- bonus (orgs.signup_bonus_credits, 1690) only:
--   * no personal invitee reward (code_invite_rewards.inviteeCredits): redeem_code grants 0 and
--     marks the redemption org_invite;
--   * the staff member gets no personal inviter reward (inviterCredits) on the customer's first
--     payment: apply_payment_code_effects skips it for an org_invite redemption, and for one from
--     before this migration whose customer is bound org_l1 to that same staff member. The org is
--     paid through affiliate commissions instead.
-- Personal codes (including an org customer's own code, org_l2) keep both rewards unchanged.
-- Rewards already paid stay (no clawback); a pending inviter reward of an earlier staff-code
-- redemption is no longer paid.
--
-- The sign-up form's code preview (code_preview_credits) shows the org's signup bonus for a staff
-- code instead of the personal invitee reward, and code_preview_org tells the form it is one, so it
-- shows nothing when the org has no bonus.
--
-- Expand-only: a column with a default, a new function, and create or replace of redeem_code
-- (2030 body plus the marked lines), apply_payment_code_effects (same signature, current body plus
-- the marked lines) and code_preview_credits. Code from before this deploy reads the same shapes.

alter table public.code_redemptions add column org_invite boolean not null default false;
comment on column public.code_redemptions.org_invite is
  'An ok invite through an org staff member''s code (2032): no personal invitee or inviter reward.';

-- The org a staff member's invite code would bind its customer to (the org_l1 branch of
-- _org_attribute_invite, without the customer-specific checks), for the sign-up form's preview.
create function public._invite_code_org(p_owner uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select o.id from public.org_members m
    join public.orgs o on o.id = m.org_id and o.status = 'active' and o.affiliate_enabled
    join public.affiliates a on a.org_id = o.id and a.status = 'active'
   where m.user_id = p_owner and m.status = 'active'
   limit 1
$$;
revoke all on function public._invite_code_org(uuid) from public, anon, authenticated, service_role;

create or replace function public.code_preview_credits(offer public.codes) returns integer
language sql stable security definer set search_path = '' as $$
  select case
    when offer.kind = 'invite' and public._invite_code_org(offer.owner_user_id) is not null then
      (select o.signup_bonus_credits from public.orgs o where o.id = public._invite_code_org(offer.owner_user_id))
    when offer.kind = 'invite' then
      (select (value->>'inviteeCredits')::integer from public.system_settings where key = 'code_invite_rewards')
    else coalesce(offer.invitee_credits, 0) end;
$$;

create function public.code_preview_org(offer public.codes) returns boolean
language sql stable security definer set search_path = '' as $$
  select offer.kind = 'invite' and public._invite_code_org(offer.owner_user_id) is not null
$$;
revoke all on function public.code_preview_org(public.codes) from public, anon, authenticated;
grant execute on function public.code_preview_org(public.codes) to service_role;

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

  -- 2032: an org staff member's code gives no personal invitee reward (the org bonus instead).
  credits := case when offer.kind = 'invite' and org_code then 0
    when offer.kind = 'invite' then
    (select (value->>'inviteeCredits')::integer from public.system_settings where key = 'code_invite_rewards')
    else coalesce(offer.invitee_credits, 0) end;
  grant_pool := case when offer.kind = 'invite' then 'free' else offer.invitee_pool end;
  insert into public.code_redemptions
    (id, code_id, kind, user_id, inviter_user_id, context, status, credits_granted, discount_expires_at,
     blocked_status, blocked_at, org_invite)
    values (redemption_id, offer.id, offer.kind, p_user, offer.owner_user_id, p_context, 'ok', credits, deadline,
     prior_status, prior_at, offer.kind = 'invite' and org_code);
  update public.codes set redemption_count = redemption_count + 1 where id = offer.id;
  if credits > 0 then
    perform public._apply_credit_change(p_user, grant_pool, 'code_grant', credits, 'Code redemption', 'code:' || redemption_id);
  end if;
  return jsonb_build_object('status', 'ok', 'kind', offer.kind, 'credits_granted', credits, 'pool', grant_pool,
    'discount_percent', offer.discount_percent, 'discount_products', offer.discount_products,
    'discount_expires_at', deadline, 'replaced', replaced);
end;
$$;

create or replace function public.apply_payment_code_effects(p_user uuid, p_payment_id bigint, p_code_id uuid,
  p_amount_discount integer, p_inviter_credits integer, p_inviter_cap integer, p_reward_window_days integer)
returns jsonb language plpgsql security definer set search_path = '' as $$

declare
  v_payment record;
  v_invite record;
  v_discount record;
  v_conflict boolean := false;
  v_rewarded boolean := false;
  v_reward_time timestamptz;
  reward_credits integer;
begin
  if p_amount_discount is null or p_amount_discount < 0 or (p_code_id is null and p_amount_discount <> 0)
     or p_inviter_cap is null or p_inviter_cap <= 0
     or p_reward_window_days is null or p_reward_window_days <= 0 then
    raise exception 'INVALID_INPUT';
  end if;

  -- T71 takes the payment lock before any balance locks. Keep that order for refund races.
  select product_id, channel, stripe_session_id, code_id, amount_discount, code_effects_applied_at,
         code_discount_conflict into v_payment
    from public.payments where id = p_payment_id and user_id = p_user for no key update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if v_payment.code_effects_applied_at is not null then
    if v_payment.code_id is distinct from p_code_id or v_payment.amount_discount <> p_amount_discount then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('applied', false, 'rewarded', false, 'conflict', v_payment.code_discount_conflict);
  end if;
  if (v_payment.channel = 'waffo' and p_code_id is not null)
     or (v_payment.channel = 'stripe' and v_payment.stripe_session_id is null) then
    raise exception 'INVALID_INPUT';
  end if;

  -- A user cannot acquire a new invitation after payment. Lock both profiles in canonical
  -- order for reciprocal invites and serialize all rewards for a given inviter.
  select id, inviter_user_id, inviter_rewarded_at, org_invite into v_invite from public.code_redemptions
    where user_id = p_user and kind = 'invite' and status = 'ok';
  perform 1 from public.profiles where id in (p_user, v_invite.inviter_user_id)
    order by id for no key update;

  if p_code_id is not null then
    select r.id, r.discount_used_payment_id into v_discount from public.code_redemptions r
      join public.codes c on c.id = r.code_id
     where r.code_id = p_code_id and r.user_id = p_user and r.status = 'ok'
       and v_payment.product_id = any(c.discount_products);
    if not found then raise exception 'PAYMENT_CODE_MISMATCH'; end if;
    v_conflict := v_discount.discount_used_payment_id is not null and v_discount.discount_used_payment_id <> p_payment_id;
    if not v_conflict then
      update public.code_redemptions set discount_used_payment_id = p_payment_id,
             checkout_token = null, checkout_expires_at = null, checkout_prepared = false where id = v_discount.id;
    end if;
  end if;

  v_reward_time := clock_timestamp();
  if v_invite.inviter_user_id is not null then
    select (value->>'inviterCredits')::integer into strict reward_credits from public.system_settings where key = 'code_invite_rewards';
  end if;
  if reward_credits > 0 and v_invite.inviter_rewarded_at is null
     -- 2032: no personal inviter reward for an org staff member's code: the org earns through
     -- commissions. Marked at redemption since 2032; an earlier one is known by its org_l1
     -- binding to that staff member.
     and not coalesce(v_invite.org_invite, false)
     and not exists (select 1 from public.profiles c where c.id = p_user
                      and c.referred_source = 'org_l1' and c.referred_member = v_invite.inviter_user_id)
     and not exists (select 1 from public.payments where user_id = p_user and id < p_payment_id)
     and exists (select 1 from public.profiles where id = v_invite.inviter_user_id and banned_at is null)
     -- Rewards survive the invitee deleting their profile and redemption.
     and (select count(*) from public.credit_ledger where user_id = v_invite.inviter_user_id
           and kind = 'invite_reward' and created_at > v_reward_time - make_interval(days => p_reward_window_days)) < p_inviter_cap then
    -- The reward has no membership product/days and never changes current_tier.
    v_rewarded := (public._apply_credit_change(v_invite.inviter_user_id, 'paid', 'invite_reward',
                    reward_credits, '邀请首付奖励', 'invite:' || v_invite.id)).applied;
    update public.code_redemptions set inviter_rewarded_at = v_reward_time, inviter_reward_payment_id = p_payment_id
      where id = v_invite.id;
  end if;
  update public.payments set code_id = p_code_id, amount_discount = p_amount_discount,
         code_discount_conflict = v_conflict, code_effects_applied_at = clock_timestamp()
    where id = p_payment_id;
  return jsonb_build_object('applied', true, 'rewarded', v_rewarded, 'conflict', v_conflict)
    || case when v_rewarded then jsonb_build_object('reward_credits', reward_credits, 'inviter_id', v_invite.inviter_user_id) else '{}'::jsonb end;
end;
$$;
