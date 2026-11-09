-- The application supplies policy numbers from site.config. Campaign effects always come
-- from the locked code, never from the request. One successful action is one transaction.
create function public.redeem_code(
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
     or p_invitee_credits is null or p_invitee_credits <= 0
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

  credits := case when offer.kind = 'invite' then p_invitee_credits else coalesce(offer.invitee_credits, 0) end;
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
revoke all on function public.redeem_code(uuid,text,text,int,int,boolean) from public, anon, authenticated;
grant execute on function public.redeem_code(uuid,text,text,int,int,boolean) to service_role;
