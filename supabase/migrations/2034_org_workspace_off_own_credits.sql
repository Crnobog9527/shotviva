-- With the enterprise workspace off, a member may also spend their own credits (Owner 2026-11-28).
--
-- Since 1897 an active member (staff and the org's main admin alike) pays only from the org's
-- shares in their account and their own credits stay frozen. That froze them even while the org's
-- workspace was off (orgs.status <> 'active'), although checkout then lets the member buy for
-- themselves (isActiveOrgMember needs an active org, Owner 2026-11-23: "the org then funds
-- nothing"), and redemption lets them use codes: credits paid for or redeemed then could not be
-- spent. Now, for a seat of an org whose workspace is off:
--  - a job is paid by the org's share of the tier's pool when that share covers the whole price
--    (as before: the org already gave those credits, the work is an org work), else by the
--    member's own credits of that pool when they cover the whole price; a job is never split
--    between the two, as in 1897. Neither covers it: CREDITS_INSUFFICIENT (the member can buy).
--  - own = the balance minus the org's share (min(held, balance)); the promotion share counts only
--    while the org's promotion month is live, as before. A pool_choice is not used: the member has
--    no picker while the workspace is off (the web reads only offer it for an active org).
--  - the share triggers (1897 paid, 1892 promotion) draw a reserve from the org's share only when
--    that share covers it (promotion: and the month is live); otherwise the reserve draws nothing
--    and only keeps the share within the balance, so own-paid jobs are not org works (1941).
-- Seats of an active org are unchanged: org shares only, reserve drawn from the share first.
--
-- Expand-only: a new private read helper; the two pool helpers and the two trigger functions are re-created from their
-- current bodies (1897, 1996, 1892) with the same signatures; nothing is dropped or renamed. Code
-- in production keeps working: a member of an org with the workspace off gets an answer where it
-- used to get ORG_CREDITS_INSUFFICIENT.

-- An org seat for the pool choice: the org's shares, the member's own credits, and whether the
-- org's workspace is on. No row for an account that is not an active member.
create function public._org_seat_shares(p_profile public.profiles)
returns table(active_org boolean, org_paid integer, org_promo integer, own_paid integer, own_free integer)
language sql stable security definer set search_path = '' as $$
  select o.status = 'active',
         least(m.held_credits, p_profile.credits),
         case when o.promo_expires_at > now() then least(m.held_promo_credits, p_profile.free_credits) else 0 end,
         p_profile.credits - least(m.held_credits, p_profile.credits),
         p_profile.free_credits - least(m.held_promo_credits, p_profile.free_credits)
    from public.org_members m join public.orgs o on o.id = m.org_id
   where m.user_id = p_profile.id and m.status = 'active'
$$;
revoke all on function public._org_seat_shares(public.profiles) from public, anon, authenticated, service_role;

create or replace function public._reserve_pool(p_profile public.profiles, p_cost integer, p_source text, p_choice text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  s record;
  v_pool text;
begin
  if p_choice is not null and p_choice not in ('paid', 'promo') then
    raise exception 'INVALID_INPUT' using detail = 'pool_choice must be paid or promo';
  end if;
  select * into s from public._org_seat_shares(p_profile);
  if not found then
    if p_profile.credits >= p_cost then return 'paid'; end if;
    if p_profile.free_credits >= p_cost then return 'free'; end if;
    raise exception 'CREDITS_INSUFFICIENT';
  end if;
  if not s.active_org then
    -- 2034: the workspace is off; paid first, then free, each wholly from the org or the member.
    if s.org_paid >= p_cost or s.own_paid >= p_cost then return 'paid'; end if;
    if s.org_promo >= p_cost or s.own_free >= p_cost then return 'free'; end if;
    raise exception 'CREDITS_INSUFFICIENT';
  end if;
  if p_choice is not null and p_source = 'web' and s.org_paid > 0 and s.org_promo > 0 then
    v_pool := case p_choice when 'paid' then 'paid' else 'free' end;
    if (case when v_pool = 'paid' then s.org_paid else s.org_promo end) < p_cost then
      raise exception 'POOL_CHOICE_INSUFFICIENT';
    end if;
    if p_profile.org_pool_choice is distinct from p_choice then
      update public.profiles set org_pool_choice = p_choice where id = p_profile.id;
    end if;
    return v_pool;
  end if;
  if s.org_paid >= p_cost then return 'paid'; end if;
  if s.org_promo >= p_cost then return 'free'; end if;
  raise exception 'ORG_CREDITS_INSUFFICIENT';
end;
$$;
revoke all on function public._reserve_pool(public.profiles, integer, text, text) from public, anon, authenticated, service_role;

create or replace function public._reserve_pool_for_tier(p_profile public.profiles, p_cost integer, p_source text, p_choice text, p_resolution text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_pool text := case when p_resolution = '1k' then 'free' else 'paid' end;
  s record;
begin
  if p_source <> 'web' then
    return public._reserve_pool(p_profile, p_cost, p_source, p_choice);
  end if;
  if p_choice is not null and p_choice not in ('paid', 'promo') then
    raise exception 'INVALID_INPUT' using detail = 'pool_choice must be paid or promo';
  end if;
  select * into s from public._org_seat_shares(p_profile);
  if not found then
    if (case when v_pool = 'paid' then p_profile.credits else p_profile.free_credits end) >= p_cost then return v_pool; end if;
    raise exception 'CREDITS_INSUFFICIENT';
  end if;
  if not s.active_org then
    -- 2034: the workspace is off; wholly from the org's share of the tier's pool or the member's own.
    if (case when v_pool = 'paid' then greatest(s.org_paid, s.own_paid) else greatest(s.org_promo, s.own_free) end) >= p_cost then return v_pool; end if;
    raise exception 'CREDITS_INSUFFICIENT';
  end if;
  if (case when v_pool = 'paid' then s.org_paid else s.org_promo end) >= p_cost then return v_pool; end if;
  raise exception 'ORG_CREDITS_INSUFFICIENT';
end;
$$;
revoke all on function public._reserve_pool_for_tier(public.profiles, integer, text, text, text) from public, anon, authenticated, service_role;

-- The paid share follows what a member spends (1629, 1897). A reserve of a seat whose org has the
-- workspace off draws the share only when it covers the whole reserve (2034), matching the pool
-- choice above; otherwise the member's own credits paid it.
create or replace function public._org_held_follows_ledger() returns trigger
language plpgsql security definer set search_path = '' as $_$
declare
  m public.org_members;
  d public.org_held_draws;
  back integer;
  v_draw integer;
  v_active boolean;
begin
  if new.delta < 0 then
    select * into m from public.org_members where user_id = new.user_id and status = 'active' for update;
    if not found then return new; end if;
    if new.kind = 'reserve' then
      select o.status = 'active' into v_active from public.orgs o where o.id = m.org_id;
      v_draw := case when v_active then least(m.held_credits, -new.delta)
                     when m.held_credits >= -new.delta then -new.delta
                     else 0 end;
    else
      v_draw := greatest(0, m.held_credits - new.balance_after);
    end if;
    if v_draw > 0 or m.held_credits > new.balance_after then
      update public.org_members set held_credits = least(held_credits - v_draw, new.balance_after) where org_id = m.org_id and user_id = m.user_id;
    end if;
    if v_draw > 0 then
      insert into public.org_held_draws(debit_key, org_id, user_id, drawn) values (new.idempotency_key, m.org_id, m.user_id, v_draw);
    end if;
  elsif new.kind = 'refund' then
    select * into d from public.org_held_draws
     where debit_key = regexp_replace(new.idempotency_key, ':[^:]+$', ':reserve') and user_id = new.user_id for update;
    if not found or d.restored >= d.drawn then return new; end if;
    back := least(new.delta, d.drawn - d.restored);
    select * into m from public.org_members where org_id = d.org_id and user_id = d.user_id and status = 'active' for update;
    if not found then
      -- Left before the refund: the org's part goes back to the org, not to the member.
      update public.org_held_draws set restored = restored + back where debit_key = d.debit_key;
      perform public._apply_credit_change(new.user_id, 'paid', 'org_reclaim', -back, 'org:' || d.org_id::text,
        'org_return:' || new.idempotency_key);
      insert into public.org_pool_returns(refund_key, org_id, user_id, credits) values (new.idempotency_key, d.org_id, d.user_id, back);
      return new;
    end if;
    update public.org_members set held_credits = least(held_credits + back, new.balance_after)
     where org_id = m.org_id and user_id = m.user_id;
    update public.org_held_draws set restored = restored + back where debit_key = d.debit_key;
  end if;
  return new;
end;
$_$;
revoke all on function public._org_held_follows_ledger() from public, anon, authenticated, service_role;

-- The promotion share (1892), with the same 2034 rule for a seat whose org has the workspace off:
-- a reserve draws the share only when the share covers it and the org's promotion month is live.
create or replace function public._org_promo_follows_ledger() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  m public.org_members;
  d public.org_promo_draws;
  o public.orgs;
  v_draw integer;
  back integer;
begin
  if new.delta < 0 then
    select * into m from public.org_members where user_id = new.user_id and status = 'active' for update;
    if not found or m.held_promo_credits = 0 then return new; end if;
    -- Only a generation reserve spends the org's share first; any other free-pool debit (an admin
    -- adjustment, an old grant's expiry) only keeps the share within the balance.
    select * into o from public.orgs where id = m.org_id;
    v_draw := case when new.kind <> 'reserve' then 0
                   when o.status = 'active' then least(m.held_promo_credits, -new.delta)
                   when m.held_promo_credits >= -new.delta and o.promo_expires_at > now() then -new.delta
                   else 0 end;
    update public.org_members set held_promo_credits = least(held_promo_credits - v_draw, new.balance_after)
     where org_id = m.org_id and user_id = m.user_id;
    if v_draw > 0 then
      insert into public.org_promo_draws(debit_key, org_id, user_id, period, drawn)
        values (new.idempotency_key, m.org_id, m.user_id,
          -- The month the share was funded for (the org's promotion month), not the debit's: a job
          -- reserved after month end but before the expiry pass still spends last month's credits.
          coalesce(public._utc_period(o.promo_expires_at - interval '1 second'), public._utc_period(new.created_at)), v_draw);
    end if;
  elsif new.kind = 'refund' then
    select * into d from public.org_promo_draws
     where debit_key = regexp_replace(new.idempotency_key, ':[^:]+$', ':reserve') and user_id = new.user_id for update;
    if not found or d.restored >= d.drawn then return new; end if;
    back := least(new.delta, d.drawn - d.restored);
    update public.org_promo_draws set restored = restored + back where debit_key = d.debit_key;
    -- Only while that month is still the org's live promotion month; otherwise it has expired.
    if d.period is distinct from (select case when o2.promo_expires_at > now() then public._utc_period(o2.promo_expires_at - interval '1 second') end
                                    from public.orgs o2 where o2.id = d.org_id) then
      perform public._apply_credit_change(new.user_id, 'free', 'org_promo_expire', -back,
        'org promotion credits expired ' || d.period, 'org_promo_return:' || new.idempotency_key);
      return new;
    end if;
    select * into m from public.org_members where org_id = d.org_id and user_id = d.user_id and status = 'active' for update;
    if not found then
      perform public._apply_credit_change(new.user_id, 'free', 'org_promo_reclaim', -back, 'org:' || d.org_id::text,
        'org_promo_return:' || new.idempotency_key);
      insert into public.org_pool_returns(refund_key, org_id, user_id, credits, pool, period)
        values (new.idempotency_key, d.org_id, d.user_id, back, 'promo', d.period);
      return new;
    end if;
    update public.org_members set held_promo_credits = least(held_promo_credits + back, new.balance_after)
     where org_id = m.org_id and user_id = m.user_id;
  end if;
  return new;
end;
$$;
revoke all on function public._org_promo_follows_ledger() from public, anon, authenticated, service_role;
