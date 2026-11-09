-- Personal invite amounts use the currently displayed credit unit, independently of the signup gift.
insert into public.system_settings (key, value)
values ('code_invite_rewards', '{"inviteeCredits":6,"inviterCredits":10}');

create function public.admin_save_invite_rewards(p_actor uuid, p_invitee integer, p_inviter integer, p_expected jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  previous jsonb;
  updated jsonb := jsonb_build_object('inviteeCredits', p_invitee, 'inviterCredits', p_inviter);
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'admin' and banned_at is null) then
    raise exception 'NOT_ADMIN';
  end if;
  if p_invitee is null or p_invitee not between 0 and 10000
     or p_inviter is null or p_inviter not between 0 and 10000 then raise exception 'INVALID_INPUT'; end if;
  select value into strict previous from public.system_settings where key = 'code_invite_rewards' for update;
  if previous is distinct from p_expected then raise exception 'INVITE_SETTINGS_CHANGED'; end if;
  if previous = updated then return; end if;
  update public.system_settings set value = updated, updated_at = now(), updated_by = p_actor
    where key = 'code_invite_rewards';
  insert into public.admin_audit_log(action, user_id, target_id, reason)
    values ('save_code', p_actor, 'code_invite_rewards', jsonb_build_object('before', previous, 'after', updated)::text);
end;
$$;
revoke all on function public.admin_save_invite_rewards(uuid, integer, integer, jsonb) from public, anon, authenticated;
grant execute on function public.admin_save_invite_rewards(uuid, integer, integer, jsonb) to service_role;

-- PostgREST computed field: include the effective amount in the existing single-code lookup.
create function public.code_preview_credits(offer public.codes) returns integer
language sql stable set search_path = '' as $$
  select case when offer.kind = 'invite' then
    (select (value->>'inviteeCredits')::integer from public.system_settings where key = 'code_invite_rewards')
    else coalesce(offer.invitee_credits, 0) end;
$$;
revoke all on function public.code_preview_credits(public.codes) from public, anon, authenticated;
grant execute on function public.code_preview_credits(public.codes) to service_role;

create or replace function public.redeem_code(
  p_user uuid, p_code text, p_context text, p_invitee_credits int, p_invite_window_days int,
  p_replace boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  offer record;
  profile record;
  inviter record;
  pending record;
  owner_id uuid;
  redemption_id uuid := gen_random_uuid();
  checked_at timestamptz;
  deadline timestamptz;
  grant_pool text;
  credits int;
  outcome text := 'ok';
  replaced boolean := false;
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
  select banned_at, signup_ip, created_at into profile from public.profiles where id = p_user;
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
  elsif exists (select 1 from public.code_redemptions where code_id = offer.id and user_id = p_user) then outcome := 'used';
  elsif offer.redemption_count >= offer.max_redemptions then outcome := 'full';
  elsif (offer.new_users_only or offer.kind = 'invite')
    and profile.created_at + make_interval(days => p_invite_window_days) <= checked_at then outcome := 'new_users_only';
  elsif offer.kind = 'invite' then
    select signup_ip, banned_at into inviter from public.profiles where id = offer.owner_user_id;
    if inviter.banned_at is not null then outcome := 'expired';
    elsif exists (select 1 from public.code_redemptions where user_id = p_user and kind = 'invite') then outcome := 'already_invited';
    elsif exists (select 1 from public.payments where user_id = p_user) then outcome := 'new_users_only';
    elsif inviter.signup_ip = profile.signup_ip then outcome := 'blocked_same_ip';
    elsif not exists (select 1 from public.credit_ledger l
      where l.idempotency_key = 'signup:' || p_user and l.user_id = p_user and l.kind = 'grant' and l.pool = 'free') then
      outcome := 'blocked_no_signup_grant';
    end if;
  end if;

  if outcome <> 'ok' then
    if outcome in ('blocked_same_ip', 'blocked_no_signup_grant') then
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

  credits := case when offer.kind = 'invite' then
    (select (value->>'inviteeCredits')::integer from public.system_settings where key = 'code_invite_rewards')
    else coalesce(offer.invitee_credits, 0) end;
  grant_pool := case when offer.kind = 'invite' then 'free' else offer.invitee_pool end;
  insert into public.code_redemptions
    (id, code_id, kind, user_id, inviter_user_id, context, status, credits_granted, discount_expires_at)
    values (redemption_id, offer.id, offer.kind, p_user, offer.owner_user_id, p_context, 'ok', credits, deadline);
  update public.codes set redemption_count = redemption_count + 1 where id = offer.id;
  if credits > 0 then
    perform public._apply_credit_change(p_user, grant_pool, 'code_grant', credits, 'Code redemption', 'code:' || redemption_id);
  end if;
  return jsonb_build_object('status', 'ok', 'kind', offer.kind, 'credits_granted', credits, 'pool', grant_pool,
    'discount_percent', offer.discount_percent, 'discount_products', offer.discount_products,
    'discount_expires_at', deadline, 'replaced', replaced);
end;
$$;

create or replace function public.apply_payment_code_effects(
  p_user uuid, p_payment_id bigint, p_code_id uuid, p_amount_discount integer,
  p_inviter_credits integer, p_inviter_cap integer, p_reward_window_days integer
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
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
  select id, inviter_user_id, inviter_rewarded_at into v_invite from public.code_redemptions
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

create or replace function public.my_invite_summary(p_user uuid, p_inviter_cap integer, p_cursor jsonb default null)
returns jsonb language sql set search_path = '' as $$
  select public.my_invite_summary(p_user, p_inviter_cap, p_cursor,
    (select s.value::text::integer from public.system_settings s where s.key = 'code_inviter_window_days'))
    || jsonb_build_object('rewards', (select value from public.system_settings where key = 'code_invite_rewards'));
$$;
