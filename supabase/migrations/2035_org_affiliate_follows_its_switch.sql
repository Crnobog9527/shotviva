-- Staff invite codes and the org signup bonus follow the affiliate switch, not the workspace
-- switch (Owner 2026-11-28, 「选 A2 改服务端」).
--
-- An org's enterprise affiliate program (orgs.affiliate_enabled, with its affiliate account active)
-- and its enterprise workspace (orgs.status) are sold separately. Until now every affiliate-side
-- rule also required orgs.status = 'active', so in an org with only the affiliate program on
-- (workspace off) a staff member's invite code bound no customer to the org (it worked as a
-- personal invite with personal rewards), its customers got no org signup bonus, and sign-ups
-- through the org's own ?ref link got no org signup bonus or partner per-IP allowance either. Now
-- those rules need only o.affiliate_enabled (and, as before, an active affiliate account and an
-- active staff seat):
--  - _invite_code_org (sign-up preview), _org_staff_code (partner per-IP allowance for a staff
--    code), _signup_org_ref (same for an org ?ref link), _org_attribute_invite (level 1 and level 2
--    binding of an invite redemption to the org), redeem_code (org_code: no personal invitee or
--    inviter reward for a staff code), _org_signup_bonus / _org_signup_bonus_after_gift (the org
--    signup bonus), grant_credits (the partner per-IP allowance for an org ?ref sign-up), and the
--    sign-up form's previews (code_preview_credits / _org / _invite_credits, via _org_code_owner).
-- Unchanged: everything about the workspace itself (pool, allowances, joining, limits, purchases
-- into the pool, _in_active_org and the code block for members of an active org), and
-- admin_org_signup_bonus_backfill, which checks the org's settings as they were at the referral
-- (a sign-up during a workspace-off period before this migration stays without the bonus, as the
-- rule then said).
--
-- Expand-only: each function is re-created from its latest body (1930, 2027, 2031, 2032) with only
-- the "o.status = 'active' and" part of these conditions removed; same signatures and returns,
-- privileges kept (create or replace keeps grants). Production code keeps working.

-- public._invite_code_org: 1 condition(s).
create or replace function public._invite_code_org(p_owner uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select o.id from public.org_members m
    join public.orgs o on o.id = m.org_id and o.affiliate_enabled
    join public.affiliates a on a.org_id = o.id and a.status = 'active'
   where m.user_id = p_owner and m.status = 'active'
   limit 1
$$;

-- public._org_staff_code: 1 condition(s).
create or replace function public._org_staff_code(p_code text, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_code collate "C" ~ '^[A-Za-z0-9]{4,20}$' and exists (
    select 1 from public.codes c
      join public.org_members m on m.user_id = c.owner_user_id and m.status = 'active'
      join public.orgs o on o.id = m.org_id and o.affiliate_enabled
      join public.affiliates a on a.org_id = o.id and a.status = 'active'
      join public.affiliate_settings s on s.singleton and s.enabled
      -- As redeem_code: a banned owner's code is expired, and a full one cannot be redeemed.
      join public.profiles owner on owner.id = c.owner_user_id and owner.banned_at is null
     where c.code = upper(p_code) and c.kind = 'invite' and c.active
       and (c.max_redemptions is null or c.redemption_count < c.max_redemptions)
       and (c.starts_at is null or c.starts_at <= now()) and (c.expires_at is null or c.expires_at > now())
       and (p_user is null or (
         a.user_id <> p_user
         and not exists (select 1 from public.org_members x where x.org_id = o.id and x.user_id = p_user and x.status = 'active')
         and exists (select 1 from public.profiles p where p.id = p_user and (p.referred_by is null or p.referred_by = a.user_id))))), false)
$$;

-- public._signup_org_ref: 1 condition(s).
create or replace function public._signup_org_ref(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_slug ~ '^[a-z0-9-]{3,24}$' and exists (
    select 1 from public.affiliates a
      join public.orgs o on o.id = a.org_id
      join public.affiliate_settings s on s.singleton and s.enabled
     where a.slug = p_slug and a.status = 'active' and o.affiliate_enabled), false)
$$;

-- public._org_attribute_invite: 2 condition(s).
create or replace function public._org_attribute_invite() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_account uuid; v_member uuid; v_via uuid; v_source text; v_try integer;
begin
  begin
    for v_try in 1..2 loop
      select o.id,a.user_id into v_org,v_account from public.org_members m
        join public.orgs o on o.id=m.org_id
        join public.affiliates a on a.org_id=o.id
        where m.user_id=new.inviter_user_id and m.status='active' and o.affiliate_enabled
          and a.status='active';
      if found then
        v_source:='org_l1'; v_member:=new.inviter_user_id; v_via:=null;
      else
        select o.id,a.user_id,inviter.referred_member into v_org,v_account,v_member from public.profiles inviter
          join public.affiliates a on a.user_id=inviter.referred_by and a.org_id is not null
          join public.orgs o on o.id=a.org_id
          where inviter.id=new.inviter_user_id and inviter.referred_source='org_l1'
            and o.affiliate_enabled and o.affiliate_levels=2 and a.status='active';
        if not found then return null; end if;
        v_source:='org_l2'; v_via:=new.inviter_user_id;
      end if;
      -- An org owner transfer (1930) holds the account row and then moves it to another user id:
      -- wait for it and resolve once more.
      perform 1 from public.affiliates where user_id=v_account for key share;
      exit when found;
      if v_try=2 then return null; end if;
    end loop;
    if v_account=new.user_id then return null; end if;
    if exists(select from public.org_members m where m.org_id=v_org and m.user_id=new.user_id and m.status='active') then
      return null;
    end if;
    update public.profiles set referred_by=v_account,referred_at=now(),referred_source=v_source,
      referred_member=v_member,referred_via=v_via
      where id=new.user_id and referred_by is null;
  exception when others or query_canceled or assert_failure then
    -- Keep no exception DETAIL/CONTEXT (it can contain a whole row).
    begin
      insert into public.org_attribution_errors(redemption_id,error)
        values(new.id,sqlstate || ': ' || left(sqlerrm,300)) on conflict(redemption_id) do nothing;
    exception when others or query_canceled or assert_failure then
      -- Even an unavailable error sink must never undo a successful redemption.
      return null;
    end;
  end;
  return null;
end;
$$;

-- public.redeem_code: 1 condition(s).
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
      where m.user_id = offer.owner_user_id and m.status = 'active' and o.affiliate_enabled
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

-- public._org_signup_bonus: 1 condition(s).
create or replace function public._org_signup_bonus()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_credits integer; v_skip text;
begin
  begin
    select o.id,o.signup_bonus_credits into v_org,v_credits from public.affiliates a
      join public.orgs o on o.id=a.org_id
      where a.user_id=new.referred_by and a.status='active' and o.affiliate_enabled;
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

-- public._org_signup_bonus_after_gift: 1 condition(s).
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
      where a.user_id=p.referred_by and a.status='active' and o.affiliate_enabled;
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

-- public.grant_credits: 1 condition(s).
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
              and o.affiliate_enabled))
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

-- The sign-up form's preview (2032) asked only "is the code's owner an active member of an active
-- org"; with A2 a staff code of an org with the workspace off but the affiliate program on is an
-- org code too (redeem_code's org_code above). One test for both.
create function public._org_code_owner(p_owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public._in_active_org(p_owner) or public._invite_code_org(p_owner) is not null
$$;
revoke all on function public._org_code_owner(uuid) from public, anon, authenticated, service_role;

-- public.code_preview_credits: the owner test is _org_code_owner.
create or replace function public.code_preview_credits(offer public.codes) returns integer
language sql stable security definer set search_path = '' as $$
  select case
    when offer.kind = 'invite' and public._org_code_owner(offer.owner_user_id) then
      coalesce((select o.signup_bonus_credits from public.orgs o where o.id = public._invite_code_org(offer.owner_user_id)), 0)
    when offer.kind = 'invite' then
      (select (value->>'inviteeCredits')::integer from public.system_settings where key = 'code_invite_rewards')
    else coalesce(offer.invitee_credits, 0) end;
$$;

-- public.code_preview_org: the owner test is _org_code_owner.
create or replace function public.code_preview_org(offer public.codes) returns boolean
language sql stable security definer set search_path = '' as $$
  select offer.kind = 'invite' and public._org_code_owner(offer.owner_user_id)
$$;

-- public.code_preview_invite_credits: the owner test is _org_code_owner.
create or replace function public.code_preview_invite_credits(p_code text, p_ref_slug text) returns integer
language plpgsql stable security definer set search_path = '' as $$
declare v_offer public.codes; v_org uuid; v_account uuid; v_ref uuid;
begin
  if p_code is null or p_code collate "C" !~ '^[A-Za-z0-9]{4,20}$' then return null; end if;
  select * into v_offer from public.codes where code = upper(p_code);
  if not found then return null; end if;
  if v_offer.kind <> 'invite' or not public._org_code_owner(v_offer.owner_user_id) then
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
