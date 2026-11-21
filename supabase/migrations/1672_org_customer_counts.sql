-- Customers per member, all time (ARCHITECTURE §6.5, card E5): what the console's member list and
-- the staff card show as "customers". The same customer set as org_member_stats: bound to THIS
-- org's affiliate account (referred_by), by that member, level 1 / 2, and not someone who has
-- since joined the org as staff. A member who moved from another org does not bring that org's
-- customers along. Owner: every member of the org; active staff: only their own row; anyone else
-- NOT_ORG_MEMBER.
create or replace function public.org_customer_counts(p_caller uuid, p_org_id uuid)
returns table(member_user_id uuid, l1_customers integer, l2_customers integer)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_owner boolean;
  v_account uuid;
begin
  select o.owner_user_id = p_caller into v_owner from public.orgs o where o.id = p_org_id;
  if v_owner is distinct from true and not exists(
    select from public.org_members m where m.org_id = p_org_id and m.user_id = p_caller and m.status = 'active'
  ) then raise exception 'NOT_ORG_MEMBER'; end if;
  select a.user_id into v_account from public.affiliates a where a.org_id = p_org_id;
  if v_account is null then return; end if;
  return query
  select c.referred_member,
         (count(*) filter (where c.referred_source = 'org_l1'))::integer,
         (count(*) filter (where c.referred_source = 'org_l2'))::integer
    from public.profiles c
   where c.referred_by = v_account and c.referred_member is not null and c.referred_source in ('org_l1', 'org_l2')
     and (coalesce(v_owner, false) or c.referred_member = p_caller)
     and not exists(select from public.org_members x where x.org_id = p_org_id and x.user_id = c.id and x.status = 'active')
   group by c.referred_member;
end;
$$;
revoke all on function public.org_customer_counts(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.org_customer_counts(uuid, uuid) to service_role;
