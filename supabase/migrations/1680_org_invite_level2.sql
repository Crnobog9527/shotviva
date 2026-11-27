-- Enterprise level-2 attribution (ARCHITECTURE §6.5, card E6). Redefines the invite hook from 1644;
-- the trigger itself (when clause, after insert on code_redemptions) is unchanged.
--
-- Level 1 is exactly as in 1644: the inviter is an active member (owner included) of an active org
-- whose affiliate switch is on and whose org account is active -> the invitee is the org's level-1
-- customer (referred_member = that member).
--
-- Level 2 is new: otherwise, if the inviter A is a level-1 customer of an org (A.referred_source =
-- 'org_l1', A.referred_by = that org's account) and that org is active, its affiliate switch is on,
-- it has two levels (affiliate_levels = 2) and its account is active, the invitee B is the org's
-- level-2 customer: referred_by = the org account, referred_via = A, referred_member = A's member
-- (kept for staff stats), referred_source = 'org_l2'. Only two levels: an org_l2 customer's invitees
-- are never attributed. Turning level 2 off only stops new bindings; existing org_l2 customers keep
-- earning the org's l2_bp (1645). A keeps their C-end invite reward: redeem_code grants it before
-- this hook runs and the hook never touches credits.
--
-- Both levels keep every 1644 guarantee: first binding wins (a customer already bound to any
-- account, personal or org, is never rebound), the org's own active members and the account holder
-- are never its customers, and any error is caught into org_attribution_errors so the redemption
-- always commits. redeem_code has already locked both profiles, so this takes no new lock order.

create or replace function public._org_attribute_invite() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_account uuid; v_member uuid; v_via uuid; v_source text;
begin
  begin
    select o.id,a.user_id into v_org,v_account from public.org_members m
      join public.orgs o on o.id=m.org_id
      join public.affiliates a on a.org_id=o.id
      where m.user_id=new.inviter_user_id and m.status='active' and o.status='active' and o.affiliate_enabled
        and a.status='active';
    if found then
      v_source:='org_l1'; v_member:=new.inviter_user_id; v_via:=null;
    else
      select o.id,a.user_id,inviter.referred_member into v_org,v_account,v_member from public.profiles inviter
        join public.affiliates a on a.user_id=inviter.referred_by and a.org_id is not null
        join public.orgs o on o.id=a.org_id
        where inviter.id=new.inviter_user_id and inviter.referred_source='org_l1'
          and o.status='active' and o.affiliate_enabled and o.affiliate_levels=2 and a.status='active';
      if not found then return null; end if;
      v_source:='org_l2'; v_via:=new.inviter_user_id;
    end if;
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
revoke all on function public._org_attribute_invite() from public,anon,authenticated,service_role;
