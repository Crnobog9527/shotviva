-- T94. The legacy RPCs keep their arguments and pass the configured window to both
-- settlement and the account summary. The account page receives the same value for display.
insert into public.system_settings (key, value) values ('code_inviter_window_days', '30'::jsonb);

-- Called after settle_checkout / settle_waffo_order (including a replay of settlement).
-- The marker also persists a negative reward decision, e.g. when the cap is full.
create function public.apply_payment_code_effects(
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
begin
  if p_amount_discount is null or p_amount_discount < 0 or (p_code_id is null and p_amount_discount <> 0)
     or p_inviter_credits is null or p_inviter_credits <= 0 or p_inviter_cap is null or p_inviter_cap <= 0
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
  if v_invite.inviter_user_id is not null and v_invite.inviter_rewarded_at is null
     and not exists (select 1 from public.payments where user_id = p_user and id < p_payment_id)
     and exists (select 1 from public.profiles where id = v_invite.inviter_user_id and banned_at is null)
     -- Rewards survive the invitee deleting their profile and redemption.
     and (select count(*) from public.credit_ledger where user_id = v_invite.inviter_user_id
           and kind = 'invite_reward' and created_at > v_reward_time - make_interval(days => p_reward_window_days)) < p_inviter_cap then
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

revoke all on function public.apply_payment_code_effects(uuid, bigint, uuid, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.apply_payment_code_effects(uuid, bigint, uuid, integer, integer, integer, integer) to service_role;

-- The account owns one code, created on first visit. Return only signup time and paid status
-- for invitees; the paging cursor names a redemption, never a friend's profile or auth data.
create function public.my_invite_summary(p_user uuid, p_inviter_cap integer, p_cursor jsonb, p_reward_window_days integer)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v_code text;
  v_result jsonb;
begin
  if p_inviter_cap is null or p_inviter_cap < 0 or p_reward_window_days is null or p_reward_window_days <= 0 then raise exception 'INVALID_INPUT'; end if;
  v_code := public.get_or_create_invite_code(p_user);
  with invited as materialized (
    select r.id, r.user_id, r.created_at,
      exists(select 1 from public.payments p where p.user_id = r.user_id and p.created_at >= r.created_at) as purchased
    from public.code_redemptions r where r.inviter_user_id = p_user and r.status = 'ok'
  ),
  page as (
    select i.id, i.created_at, pr.created_at as registered_at, i.purchased
    from invited i join public.profiles pr on pr.id = i.user_id
    where p_cursor is null or (i.created_at,i.id) < ((p_cursor->>'created_at')::timestamptz,(p_cursor->>'id')::uuid)
    order by i.created_at desc, i.id desc limit 30
  ),
  rewards as (
    select coalesce(sum(l.delta),0) as earned,
      count(*) filter (where l.created_at > now() - make_interval(days => p_reward_window_days)) as used
    from public.credit_ledger l where l.user_id = p_user and l.kind = 'invite_reward'
  )
  select jsonb_build_object('code', v_code, 'invited', count(*),
    'purchasers', count(*) filter (where i.purchased), 'earned', (select earned from rewards),
    'reward_window_days', p_reward_window_days,
    'rewards_left', greatest(0, p_inviter_cap - (select used from rewards)),
    'friends', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc, p.id desc) from page p), '[]'::jsonb))
  into v_result from invited i;
  return v_result;
end;
$$;
revoke all on function public.my_invite_summary(uuid,integer,jsonb,integer) from public, anon, authenticated;
grant execute on function public.my_invite_summary(uuid,integer,jsonb,integer) to service_role;

-- Existing callers, including the previous deployment, use the one stored policy value.
create or replace function public.apply_payment_code_effects(
  p_user uuid, p_payment_id bigint, p_code_id uuid, p_amount_discount integer,
  p_inviter_credits integer, p_inviter_cap integer
) returns jsonb language sql security definer set search_path = '' as $$
  select public.apply_payment_code_effects(p_user, p_payment_id, p_code_id, p_amount_discount,
    p_inviter_credits, p_inviter_cap,
    (select s.value::text::integer from public.system_settings s where s.key = 'code_inviter_window_days'));
$$;

create or replace function public.my_invite_summary(p_user uuid, p_inviter_cap integer, p_cursor jsonb default null)
returns jsonb language sql set search_path = '' as $$
  select public.my_invite_summary(p_user, p_inviter_cap, p_cursor,
    (select s.value::text::integer from public.system_settings s where s.key = 'code_inviter_window_days'));
$$;

-- Use the existing admin-only configuration writer for both T94 settings.
create or replace function public.admin_set_system_setting(p_key text, p_value jsonb, p_actor uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_actor is null then
    raise exception 'INVALID_INPUT' using detail = 'actor is required';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_actor and p.role = 'admin'
      and (p_key not in ('code_gift_policy','code_inviter_window_days') or p.banned_at is null)) then
    raise exception 'NOT_ADMIN';
  end if;

  case p_key
    when 'wishlist_enabled' then
      if p_value is null or jsonb_typeof(p_value) <> 'boolean' then
        raise exception 'INVALID_INPUT' using detail = 'wishlist_enabled must be a boolean';
      end if;
    when 'admin_test_daily_budget_usd' then
      if p_value is null or jsonb_typeof(p_value) <> 'number'
         or (p_value #>> '{}')::numeric < 0 or (p_value #>> '{}')::numeric > 1000 then
        raise exception 'INVALID_INPUT' using detail = 'admin_test_daily_budget_usd must be a number from 0 to 1000';
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
end;
$$;
