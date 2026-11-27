-- Enterprise signup bonus also for the org's own partner link (ARCHITECTURE §6.5; incident
-- 2026-11-27). 1690 gave the bonus only when a staff invite code binds a new user as the org's
-- level-1 customer (referred_source 'org_l1'). An org's account is also an ordinary partner
-- account with a slug: its ?ref= link (the partner page "add ?ref=… to any page" and template share
-- links of the org owner) binds a new account to the org account through affiliate_bind with
-- referred_source 'signup'. Commission already treats that customer as the org's level 1, but the
-- bonus trigger never fired, so customers who came through the enterprise's link got nothing.
--
-- 1. A second trigger on the same function fires for the first 'signup' binding of an unbound
--    account. The function still requires the bound account to be an org account (a personal
--    partner's customer has no org and gets nothing), the org active, its affiliate switch on, its
--    account active, an amount > 0 and no payment. The ref path has none of redeem_code's checks,
--    so it adds the invite's two that matter here: the account got its signup gift (which carries
--    the per-network and per-phone limits, 1480) and it is not an active member of that org.
--    first_checkout (binding at a first purchase) is not a signup and never fires.
-- 2. admin_org_signup_bonus_backfill gives the bonus to one customer bound this way before this
--    migration, under the same rules, once (same record row and ledger key as the trigger, so it
--    can never pay twice or pay someone the trigger already paid). Only a customer who would have
--    qualified at the binding: from the audit log, the org's bonus then was > 0, the org active and
--    its affiliate switch on (when the log cannot tell, refuse); the signup gift was already there;
--    the 2010 trigger did not see and refuse it. It pays the amount then. The org must still be
--    active with the bonus on today.
--    Dry run by default, showing referred_at and the amount then; audited as org_update on the org.
--
-- Expand-only: create or replace of the 1690 function (the org_l1 path is unchanged), one new
-- trigger, one new admin function and its private helper. No table or constraint change.

create or replace function public._org_signup_bonus() returns trigger
language plpgsql security definer set search_path='' as $$
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
        when exists(select from public.org_members m where m.org_id=v_org and m.user_id=new.id and m.status='active') then 'blocked_org_member'
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
revoke all on function public._org_signup_bonus() from public,anon,authenticated,service_role;

-- The first binding of an unbound account through a partner link at signup. For a personal
-- partner the function finds no org and returns.
create trigger org_signup_bonus_ref after update of referred_source on public.profiles
  for each row when (new.referred_source='signup' and old.referred_source is null
    and old.referred_by is null and new.referred_by is not null)
  execute function public._org_signup_bonus();

-- Admin back-fill for one customer bound through an org's partner link before 2010. Returns
-- {status, org_id?, credits?}: 'eligible' (dry run), 'granted', 'already' (has the bonus), or
-- 'not_eligible' with a reason. Nothing is written unless p_apply.
-- An org setting as it stood at p_at, from the audit log (admin_org_update stores its whole input,
-- admin_org_set_signup_bonus {"signup_bonus_credits":{"before","after"}}). Returns
-- {"known": true, "value": …} for the last audited value at or before p_at. With nothing audited
-- before p_at: the bonus is the "before" of its first later change (it is only ever changed by
-- that audited function); any other key is its value now if nothing was audited after p_at either
-- (unchanged since the org was created), else {"known": false} (the value then cannot be told).
create function public._org_setting_at(p_org uuid, p_key text, p_at timestamptz, p_now jsonb) returns jsonb
language sql stable security definer set search_path='' as $$
  with logged as (
    select l.created_at, l.id,
      case when p_key='signup_bonus_credits' then r->'signup_bonus_credits'->'after' else r->p_key end as v,
      case when p_key='signup_bonus_credits' then r->'signup_bonus_credits'->'before' end as b
      from public.admin_audit_log l
      cross join lateral (select case when l.reason ~ '^\s*\{' then l.reason::jsonb end r) x
     where l.action='org_update' and l.target_id=p_org::text and r ? p_key)
  select coalesce(
    (select jsonb_build_object('known',true,'value',v) from logged where created_at<=p_at order by created_at desc, id desc limit 1),
    (select case when b is not null then jsonb_build_object('known',true,'value',b) else jsonb_build_object('known',false) end
       from logged where created_at>p_at order by created_at, id limit 1),
    jsonb_build_object('known',true,'value',p_now));
$$;
revoke all on function public._org_setting_at(uuid,text,timestamptz,jsonb) from public,anon,authenticated,service_role;

create function public.admin_org_signup_bonus_backfill(p_actor uuid, p_user uuid, p_apply boolean)
returns jsonb
language plpgsql security definer set search_path='' as $$
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
    when exists(select from public.org_members m where m.org_id=v_org and m.user_id=p_user and m.status='active') then 'org_member'
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
revoke all on function public.admin_org_signup_bonus_backfill(uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.admin_org_signup_bonus_backfill(uuid,uuid,boolean) to service_role;
