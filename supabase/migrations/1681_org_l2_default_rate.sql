-- The org level-2 rate defaults to 5% for every product kind (ARCHITECTURE §6.5, card E6).
--
-- The commission function (1645) pays an org_l2 customer coalesce(override.l2_bp, affiliate_rates.l2_bp).
-- The program defaults' l2_bp is the personal team bonus (pack 5%, monthly 5%, yearly 3%), so without
-- an override a yearly plan bought by a level-2 customer would earn the org 3%, not the plan's 5%.
-- Each org account therefore carries l2_bp overrides of 500 for every kind, with l1_bp left null so
-- level 1 keeps following the program defaults. The admin sees and edits them like any override
-- (/admin/orgs, /admin/affiliates). The template floor is unaffected: catalog_fee_components counts
-- an account's own l1 and its parent's l2, and an org account is never anyone's parent.
--
-- Seeded when an org account is created or a personal row is converted (the conversion still drops
-- the personal special rates first), and once here for org accounts that already exist. An l2_bp an
-- admin has already set is never overwritten.

create function public._org_affiliate_default_rates(p_user uuid) returns void
language sql security definer set search_path='' as $$
  insert into public.affiliate_rate_overrides as o(user_id,product_kind,l1_bp,l2_bp)
    select p_user,r.product_kind,null,500 from public.affiliate_rates r
    on conflict(user_id,product_kind) do update set l2_bp=excluded.l2_bp where o.l2_bp is null;
$$;
revoke all on function public._org_affiliate_default_rates(uuid) from public,anon,authenticated,service_role;

-- Same as 1643 plus the two default-rate calls.
create or replace function public._org_affiliate_account() returns trigger
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
    perform public._org_affiliate_default_rates(new.owner_user_id);
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
    perform public._org_affiliate_default_rates(a.user_id);
  end if;
  return null;
end;
$$;
revoke all on function public._org_affiliate_account() from public,anon,authenticated,service_role;

select public._org_affiliate_default_rates(user_id) from public.affiliates where org_id is not null;
