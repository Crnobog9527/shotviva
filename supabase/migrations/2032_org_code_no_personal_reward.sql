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
-- The sign-up form's code preview shows the org's signup bonus for an org member's code only when
-- the customer would be bound to that org, and nothing otherwise (see code_preview_invite_credits).
--
-- Expand-only: a column with a default, a new function, and create or replace of redeem_code
-- (2030 body plus the marked lines), apply_payment_code_effects (same signature, current body plus
-- the marked lines) and code_preview_credits. Code from before this deploy reads the same shapes.

-- Owner, broadened the same day: while someone is an active member (staff or the main admin) of an
-- active org, their personal credits come only from the org's allocations (org paid pool and promo
-- pool, allocated by the main admin, to himself too), platform admin adjustments (admin_adjust) and
-- refunds of their own jobs. So for an active member:
--   * redeem_code refuses every code (reported new_users_only, nothing written); the redeem API
--     already refuses org members (assertNotOrgMember), this covers the 2030 retry after a gift;
--   * an active member's own invite code gives no personal invitee or inviter reward (like a staff
--     code above, whether or not the org's affiliate switch is on): marked org_invite at
--     redemption, so a reward earned while a member is never paid later, even after they leave;
--     the inviter reward is also skipped while the inviter is an active member at payment time;
--   * the signup gift is not paid while they are an active member: grant_credits' signup branch,
--     claim_signup_gift (not_pending) and the 2026 catch-up queue skip them. A pending gift (from
--     sign-up, before joining) stays pending and follows the personal rules once they leave;
--   * the org signup bonus (1690 / 2010 / 2023 / back-fill) skips a customer who is an active member
--     of any active org (was: of that org only).
-- Already blocked and unchanged: purchases by staff (ORG_MEMBER_CHECKOUT), staff-link sign-ups
-- (refusal 'staff', 1940), partner promo credits (they go to the org's promo pool). A main admin's
-- own purchases are a separate change (2033). Credits members hold from before joining stay.

-- An active member (any role) of an active org.
create function public._in_active_org(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.org_members m join public.orgs o on o.id = m.org_id
                  where m.user_id = p_user and m.status = 'active' and o.status = 'active')
$$;
revoke all on function public._in_active_org(uuid) from public, anon, authenticated, service_role;

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

-- The sign-up preview follows the redemption's decision (review on #980): a code whose owner is an
-- active member of an active org gives no personal invitee credits; the form shows the org's signup
-- bonus only when this customer would actually be bound to that org (affiliate switch on, active
-- org account, and not taken first by another partner's ?ref link, which binds before the code),
-- else nothing. code_preview_credits (the column older code reads) cannot see the visitor's link,
-- so it assumes none; the current app asks code_preview_invite_credits with the sv_ref slug.
create or replace function public.code_preview_credits(offer public.codes) returns integer
language sql stable security definer set search_path = '' as $$
  select case
    when offer.kind = 'invite' and public._in_active_org(offer.owner_user_id) then
      coalesce((select o.signup_bonus_credits from public.orgs o where o.id = public._invite_code_org(offer.owner_user_id)), 0)
    when offer.kind = 'invite' then
      (select (value->>'inviteeCredits')::integer from public.system_settings where key = 'code_invite_rewards')
    else coalesce(offer.invitee_credits, 0) end;
$$;

-- A code whose owner is an active member of an active org: no personal invitee reward.
create function public.code_preview_org(offer public.codes) returns boolean
language sql stable security definer set search_path = '' as $$
  select offer.kind = 'invite' and public._in_active_org(offer.owner_user_id)
$$;
revoke all on function public.code_preview_org(public.codes) from public, anon, authenticated;
grant execute on function public.code_preview_org(public.codes) to service_role;

-- The preview's credits for this visitor: as code_preview_credits, but an org member's code shows
-- nothing when the visitor's partner link (sv_ref slug, resolved here as affiliate_bind would:
-- programme on, active affiliate) belongs to anyone but that org's account. null: no such code.
create function public.code_preview_invite_credits(p_code text, p_ref_slug text) returns integer
language plpgsql stable security definer set search_path = '' as $$
declare v_offer public.codes; v_org uuid; v_account uuid; v_ref uuid;
begin
  if p_code is null or p_code collate "C" !~ '^[A-Za-z0-9]{4,20}$' then return null; end if;
  select * into v_offer from public.codes where code = upper(p_code);
  if not found then return null; end if;
  if v_offer.kind <> 'invite' or not public._in_active_org(v_offer.owner_user_id) then
    return public.code_preview_credits(v_offer);
  end if;
  v_org := public._invite_code_org(v_offer.owner_user_id);
  if v_org is null then return 0; end if;
  select a.user_id into v_account from public.affiliates a where a.org_id = v_org;
  if p_ref_slug is not null and p_ref_slug ~ '^[a-z0-9-]{3,24}$' then
    select a.user_id into v_ref from public.affiliates a
      join public.affiliate_settings st on st.singleton and st.enabled
     where a.slug = p_ref_slug and a.status = 'active';
    if v_ref is not null and v_ref <> v_account then return 0; end if;
  end if;
  return coalesce((select o.signup_bonus_credits from public.orgs o where o.id = v_org), 0);
end;
$$;
revoke all on function public.code_preview_invite_credits(text, text) from public, anon, authenticated;
grant execute on function public.code_preview_invite_credits(text, text) to service_role;

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
  -- 2032: an active org member gets no personal credits from any code.
  elsif public._in_active_org(p_user) then outcome := 'org_member';
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
  if outcome = 'org_member' then
    -- Reported as new_users_only for code from before this deploy; org_member says why.
    return jsonb_build_object('kind', offer.kind, 'status', 'new_users_only', 'org_member', true);
  end if;
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
  -- 2032: nor does an active org member's own code, affiliate switch on or off.
  org_code := org_code or (offer.kind = 'invite' and public._in_active_org(offer.owner_user_id));
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
     and not public._in_active_org(v_invite.inviter_user_id)
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
    -- 2032: no signup gift while an active org member; a pending one waits until they leave.
    if public._in_active_org(p_user_id)
       and not exists (select 1 from public.credit_ledger where idempotency_key = p_idempotency_key) then
      return row(false,v_profile.credits,v_profile.free_credits,v_profile.paid_until)::public.credit_change;
    end if;
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

create or replace function public.claim_signup_gift(p_user_id uuid, p_method text default null)
returns text language plpgsql security definer set search_path = '' as $$
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
  -- 2032: no signup gift claim while an active org member.
  if found and public._in_active_org(p_user_id) then
    return 'not_pending';
  end if;
  -- Pending: over the allowance since 1480, a 1350 'same_ip', or an older same-IP refusal that
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
    -- An org ?ref customer the 2010 trigger skipped for want of this gift gets the org bonus now.
    perform public._org_signup_bonus_after_gift(p_user_id);
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

create or replace function public.signup_gift_catch_up_queue(p_limit integer)
returns uuid[] language plpgsql stable security definer set search_path = '' as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'INVALID_INPUT' using detail = 'limit must be from 1 to 500';
  end if;
  return array(
    select p.id from public.profiles p
     where p.signup_gift_refusal = 'daily_cap' and p.banned_at is null
       and public.signup_gift_amount(p.created_at) > 0
       and not public._in_active_org(p.id)  -- 2032
       and not exists (select 1 from public.credit_ledger l where l.idempotency_key = 'signup:' || p.id::text)
     order by p.created_at, p.id
     limit p_limit);
end;
$$;

create or replace function public._org_signup_bonus()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_credits integer; v_skip text;
begin
  begin
    select o.id,o.signup_bonus_credits into v_org,v_credits from public.affiliates a
      join public.orgs o on o.id=a.org_id
      where a.user_id=new.referred_by and a.status='active' and o.status='active' and o.affiliate_enabled;
    if not found or v_credits is null or v_credits <= 0 then return null; end if;
    -- A paid account is never a new user (redeem_code refuses it too; this is belt and braces).
    if exists(select from public.payments where user_id=new.id) then return null; end if;
    -- The org's partner link (2010): the checks redeem_code makes for a staff invite. A refusal
    -- is recorded (like redeem_code's blocked_no_signup_grant) so a skipped customer can be found.
    if new.referred_source='signup' then
      v_skip := case
        when not exists(select from public.credit_ledger l where l.user_id=new.id and l.idempotency_key='signup:' || new.id
          and l.kind='grant' and l.pool='free') then 'blocked_no_signup_grant'
        when (public._in_active_org(new.id) or exists(select from public.org_members m where m.org_id=v_org and m.user_id=new.id and m.status='active')) then 'blocked_org_member'
      end;
      if v_skip is not null then
        insert into public.org_signup_bonus_errors(user_id,error) values(new.id,v_skip) on conflict(user_id) do nothing;
        return null;
      end if;
    end if;
    insert into public.org_signup_bonuses(user_id,org_id,member_user_id,credits)
      values(new.id,v_org,new.referred_member,v_credits) on conflict(user_id) do nothing;
    if not found then return null; end if;
    perform public._apply_credit_change(new.id,'free','org_signup_bonus',v_credits,
      'Enterprise invite signup bonus','org_signup_bonus:' || new.id);
  exception when others or query_canceled or assert_failure then
    -- Keep no exception DETAIL/CONTEXT (it can contain a whole row).
    begin
      insert into public.org_signup_bonus_errors(user_id,error)
        values(new.id,sqlstate || ': ' || left(sqlerrm,300)) on conflict(user_id) do nothing;
    exception when others or query_canceled or assert_failure then
      return null;
    end;
  end;
  return null;
end;
$$;

create or replace function public._org_signup_bonus_after_gift(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.profiles; v_org uuid; v_now integer; v_credits integer;
begin
  begin
    if not exists(select from public.org_signup_bonus_errors e where e.user_id=p_user and e.error='blocked_no_signup_grant') then
      return;
    end if;
    -- claim_signup_gift holds this row's lock (as do the trigger and the back-fill).
    select * into p from public.profiles where id=p_user;
    if not found or p.referred_source is distinct from 'signup' or p.banned_at is not null then return; end if;
    select o.id,o.signup_bonus_credits into v_org,v_now from public.affiliates a
      join public.orgs o on o.id=a.org_id
      where a.user_id=p.referred_by and a.status='active' and o.status='active' and o.affiliate_enabled;
    if not found or v_now is null or v_now <= 0 then return; end if;
    if exists(select from public.payments where user_id=p_user) then return; end if;
    if public._in_active_org(p_user) or exists(select from public.org_members m where m.org_id=v_org and m.user_id=p_user and m.status='active') then return; end if;
    v_credits := coalesce((public._org_setting_at(v_org,'signup_bonus_credits',p.referred_at,'0'::jsonb)->>'value')::integer,0);
    if v_credits <= 0 then return; end if;
    insert into public.org_signup_bonuses(user_id,org_id,member_user_id,credits)
      values(p_user,v_org,p.referred_member,v_credits) on conflict(user_id) do nothing;
    if not found then return; end if;
    perform public._apply_credit_change(p_user,'free','org_signup_bonus',v_credits,
      'Enterprise invite signup bonus','org_signup_bonus:' || p_user);
    delete from public.org_signup_bonus_errors where user_id=p_user;
  exception when others or query_canceled or assert_failure then
    -- Keep no exception DETAIL/CONTEXT (it can contain a whole row).
    begin
      update public.org_signup_bonus_errors set error=sqlstate || ': ' || left(sqlerrm,300), at=now() where user_id=p_user;
    exception when others or query_canceled or assert_failure then
      return;
    end;
  end;
end;
$$;

create or replace function public.admin_org_signup_bonus_backfill(p_actor uuid, p_user uuid, p_apply boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.profiles; v_o public.orgs; v_org uuid; v_credits integer; v_reason text; v_then integer;
  v_bonus_at jsonb; v_status_at jsonb; v_switch_at jsonb;
begin
  perform public._org_require_admin(p_actor);
  if p_user is null or p_apply is null then raise exception 'INVALID_INPUT'; end if;
  -- The profile lock serializes with the trigger and with another back-fill of the same user.
  select * into p from public.profiles where id=p_user for update;
  if not found then return jsonb_build_object('status','not_eligible','reason','no_profile'); end if;
  if exists(select from public.org_signup_bonuses where user_id=p_user) then
    return jsonb_build_object('status','already');
  end if;
  select o.id,o.signup_bonus_credits into v_org,v_credits from public.affiliates a
    join public.orgs o on o.id=a.org_id
    where a.user_id=p.referred_by and a.status='active' and o.status='active' and o.affiliate_enabled;
  -- What the trigger would have seen at the binding, from the audit log (_org_setting_at): the
  -- org's bonus (never set = the default 0), its status and its affiliate switch then. When the
  -- log cannot tell (a change after the binding and none before), refuse: conservative by default.
  if v_org is not null then
    select * into v_o from public.orgs where id=v_org;
    v_bonus_at := public._org_setting_at(v_org,'signup_bonus_credits',p.referred_at,'0'::jsonb);
    v_status_at := public._org_setting_at(v_org,'status',p.referred_at,to_jsonb(v_o.status));
    v_switch_at := public._org_setting_at(v_org,'affiliate_enabled',p.referred_at,to_jsonb(v_o.affiliate_enabled));
    v_then := case when (v_bonus_at->>'known')::boolean then coalesce((v_bonus_at->>'value')::integer,0) end;
  end if;
  v_reason := case
    when p.referred_source is distinct from 'signup' then 'not_bound_by_link'
    when v_org is null then 'not_org_customer'
    when v_credits is null or v_credits <= 0 then 'bonus_off'
    when not (v_bonus_at->>'known')::boolean then 'bonus_unknown_at_bind'
    when v_then <= 0 then 'bonus_off_at_bind'
    when not (v_status_at->>'known')::boolean then 'status_unknown_at_bind'
    when v_status_at->>'value' is distinct from 'active' then 'org_inactive_at_bind'
    when not (v_switch_at->>'known')::boolean then 'affiliate_unknown_at_bind'
    when (v_switch_at->>'value')::boolean is not true then 'affiliate_off_at_bind'
    when p.banned_at is not null then 'banned'
    when exists(select from public.payments where user_id=p_user) then 'paid'
    -- The gift must have been there when the binding happened (as the trigger checks it then).
    when not exists(select from public.credit_ledger l where l.user_id=p_user and l.idempotency_key='signup:' || p_user
      and l.kind='grant' and l.pool='free' and l.created_at<=p.referred_at) then 'no_signup_gift_at_bind'
    -- The 2010 trigger saw this binding and refused it (or failed): not a customer the bug skipped.
    when exists(select from public.org_signup_bonus_errors e where e.user_id=p_user) then 'refused_by_trigger'
    when public._in_active_org(p_user) or exists(select from public.org_members m where m.org_id=v_org and m.user_id=p_user and m.status='active') then 'org_member'
  end;
  if v_reason is not null then
    return jsonb_build_object('status','not_eligible','reason',v_reason,'org_id',v_org,
      'referred_at',p.referred_at,'bonus_at_bind',v_then,'bonus_now',v_credits);
  end if;
  -- Paid at the amount in force at the binding (the spec's rule), not today's.
  v_credits := v_then;
  if not p_apply then
    return jsonb_build_object('status','eligible','org_id',v_org,'credits',v_credits,
      'referred_at',p.referred_at,'bonus_at_bind',v_then);
  end if;
  insert into public.org_signup_bonuses(user_id,org_id,member_user_id,credits)
    values(p_user,v_org,p.referred_member,v_credits) on conflict(user_id) do nothing;
  if not found then return jsonb_build_object('status','already'); end if;
  perform public._apply_credit_change(p_user,'free','org_signup_bonus',v_credits,
    'Enterprise invite signup bonus','org_signup_bonus:' || p_user);
  perform public._org_audit(p_actor,'org_update',v_org::text,
    jsonb_build_object('signup_bonus_backfill',jsonb_build_object('user',p_user,'credits',v_credits))::text);
  return jsonb_build_object('status','granted','org_id',v_org,'credits',v_credits);
end;
$$;
