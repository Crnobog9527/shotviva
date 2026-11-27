-- The org's enterprise affiliate account (ARCHITECTURE §6.5): turning an org's affiliate switch on
-- (at creation or later) gives its owner an active affiliates row with org_id set — no application,
-- no parent, no team. Turning it off suspends that account (new commissions are void as
-- affiliate_inactive, as for any suspended account); turning it on again restores it, but only if
-- the switch is what suspended it (suspended_by_org_switch): an admin's suspension or ban stays.
--
-- The owner's earlier personal row, if any, must be closed (admin_org_create already refused an open
-- one) and fully settled: it is then converted in place, because the row is keyed by user_id. Its
-- personal rate overrides are deleted so the org starts on the program defaults (the admin sets the
-- org's rates). Its old customers stay bound to the same row and from then on earn at the org's
-- rates; a later refund of a payment whose commission was paid out in the personal period is
-- clawed back from this (now org) account's balance. A banned personal account is never converted.
--
-- Errors here are raised on purpose: they fail the admin's create/update with a clear code.

create function public._org_affiliate_account() returns trigger
language plpgsql security definer set search_path='' as $$
declare a public.affiliates; b public.affiliate_balances;
begin
  if tg_op='UPDATE' and old.affiliate_enabled is not distinct from new.affiliate_enabled then return null; end if;
  if not new.affiliate_enabled then
    update public.affiliates set status='suspended',suspended_by_org_switch=true
      where user_id=new.owner_user_id and org_id=new.id and status='active';
    return null;
  end if;
  select * into a from public.affiliates where user_id=new.owner_user_id for update;
  if not found then
    insert into public.affiliates(user_id,slug,status,org_id,application,approved_at,approved_by)
      values(new.owner_user_id,'sv-' || substr(replace(gen_random_uuid()::text,'-',''),1,20),'active',new.id,
             '{"source":"org"}',now(),new.created_by);
  elsif a.org_id=new.id then
    update public.affiliates set status='active',suspended_by_org_switch=false
      where user_id=a.user_id and status='suspended' and suspended_by_org_switch;
  elsif a.org_id is not null or a.status not in ('rejected','suspended') then
    raise exception 'ORG_PERSONAL_AFFILIATE';
  else
    select * into b from public.affiliate_balances where affiliate_user_id=a.user_id;
    if b.available<>0 or b.pending<>0
       or exists(select from public.affiliate_commissions c where c.affiliate_user_id=a.user_id and c.status='on_hold')
       or exists(select from public.affiliate_payouts p where p.affiliate_user_id=a.user_id and p.status in ('due','held')) then
      raise exception 'ORG_PERSONAL_AFFILIATE_UNSETTLED';
    end if;
    update public.affiliates set org_id=new.id,status='active',parent_user_id=null,team_enabled=false,
      reject_reason=null,reapply_allowed=false,approved_at=now(),approved_by=null
      where user_id=a.user_id;
    delete from public.affiliate_rate_overrides where user_id=a.user_id;
  end if;
  return null;
end;
$$;
revoke all on function public._org_affiliate_account() from public,anon,authenticated,service_role;

create trigger org_affiliate_account after insert or update of affiliate_enabled on public.orgs
  for each row execute function public._org_affiliate_account();
