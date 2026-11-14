-- Called after settle_checkout / settle_waffo_order (including a replay of settlement).
-- The marker also persists a negative reward decision, e.g. when the cap is full.
create function public.apply_payment_code_effects(
  p_user uuid, p_payment_id bigint, p_code_id uuid, p_amount_discount integer,
  p_inviter_credits integer, p_inviter_cap integer
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
begin
  if p_amount_discount is null or p_amount_discount < 0 or (p_code_id is null and p_amount_discount <> 0)
     or p_inviter_credits is null or p_inviter_credits <= 0 or p_inviter_cap is null or p_inviter_cap <= 0 then
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
  if v_invite.inviter_user_id is not null and v_invite.inviter_rewarded_at is null
     and not exists (select 1 from public.payments where user_id = p_user and id < p_payment_id)
     and exists (select 1 from public.profiles where id = v_invite.inviter_user_id and banned_at is null)
     -- Rewards survive the invitee deleting their profile and redemption.
     and (select count(*) from public.credit_ledger where user_id = v_invite.inviter_user_id
           and kind = 'invite_reward' and created_at > v_reward_time - interval '30 days') < p_inviter_cap then
    -- The reward has no membership product/days and never changes current_tier.
    v_rewarded := (public._apply_credit_change(v_invite.inviter_user_id, 'paid', 'invite_reward',
                    p_inviter_credits, '邀请首付奖励', 'invite:' || v_invite.id)).applied;
    update public.code_redemptions set inviter_rewarded_at = v_reward_time, inviter_reward_payment_id = p_payment_id
      where id = v_invite.id;
  end if;
  update public.payments set code_id = p_code_id, amount_discount = p_amount_discount,
         code_discount_conflict = v_conflict, code_effects_applied_at = clock_timestamp()
    where id = p_payment_id;
  return jsonb_build_object('applied', true, 'rewarded', v_rewarded, 'conflict', v_conflict);
end;
$$;

revoke all on function public.apply_payment_code_effects(uuid, bigint, uuid, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.apply_payment_code_effects(uuid, bigint, uuid, integer, integer, integer) to service_role;
