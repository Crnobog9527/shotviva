-- Monthly performance of an enterprise org's members (ARCHITECTURE §6.5, card E5). Read-only:
-- no table, no write. The org owner gets one row per member; a staff member gets only their own
-- row. Anyone else (an outsider, a member who has left, an unknown org) gets NOT_ORG_MEMBER, the
-- same answer for "no such org" and "not yours" so the function does not reveal which orgs exist.
--
-- Months are UTC calendar months ('YYYY-MM', like org_monthly_topup). For the month:
--   allocated     credits the org gave the member: -sum(delta) of their `allocate` ledger rows
--                 (monthly top-up and hand allocations; reclaims are not netted off).
--   used          credits of the org's share the member spent, net of later refunds:
--                 sum(drawn - restored) of org_held_draws rows created in the month.
--   lN_signups    customers of level N bound to the member (profiles.referred_member, source
--                 org_l1 / org_l2) whose binding (referred_at) falls in the month.
--   lN_paying     of ALL the member's level-N customers, how many paid something net > 0 in the month.
--   lN_paid_cents what those customers paid in the month, USD cents, pre-tax and net of refunds:
--                 per payment (amount_total - amount_tax) * (amount_total - amount_refunded) /
--                 amount_total, truncated like commissions are (_affiliate_due). Only USD
--                 payments (commissions are USD only), only payments made after the binding.
-- A customer who has since joined the org as staff is not the org's customer (his commissions
-- are void, org_member) and is left out. A member who left keeps his rows for the months he
-- has activity in (referred_member is kept as history), shown with status 'removed'.
create or replace function public.org_member_stats(p_caller uuid, p_org_id uuid, p_period text)
returns table(
  member_user_id uuid, member_role text, member_status text, allocated bigint, used bigint,
  l1_signups integer, l1_paying integer, l1_paid_cents bigint,
  l2_signups integer, l2_paying integer, l2_paid_cents bigint
)
language plpgsql stable security definer set search_path = '' set "TimeZone" = 'UTC' as $$
#variable_conflict use_column
declare
  v_start timestamptz;
  v_end timestamptz;
  v_owner boolean;
  v_account uuid;
begin
  if p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'INVALID_INPUT'; end if;
  select o.owner_user_id = p_caller into v_owner from public.orgs o where o.id = p_org_id;
  if v_owner is distinct from true and not exists(
    select from public.org_members m where m.org_id = p_org_id and m.user_id = p_caller and m.status = 'active'
  ) then raise exception 'NOT_ORG_MEMBER'; end if;
  v_start := ((p_period || '-01')::timestamp) at time zone 'UTC';
  v_end := v_start + interval '1 month';
  select a.user_id into v_account from public.affiliates a where a.org_id = p_org_id;

  return query
  with seats as (
    select m.user_id, m.role, m.status, m.joined_at from public.org_members m
     where m.org_id = p_org_id and (coalesce(v_owner, false) or m.user_id = p_caller)
  ),
  alloc as (
    select l.member_user_id as uid, -sum(l.delta) as amount from public.org_credit_ledger l
     where l.org_id = p_org_id and l.kind = 'allocate' and l.created_at >= v_start and l.created_at < v_end
     group by l.member_user_id
  ),
  spent as (
    select d.user_id as uid, sum(d.drawn - d.restored) as amount from public.org_held_draws d
     where d.org_id = p_org_id and d.created_at >= v_start and d.created_at < v_end
     group by d.user_id
  ),
  cust as (
    select c.id, c.referred_member as uid, c.referred_source as src, c.referred_at from public.profiles c
     where v_account is not null and c.referred_by = v_account and c.referred_member is not null
       and c.referred_source in ('org_l1', 'org_l2')
       and not exists(select from public.org_members x where x.org_id = p_org_id and x.user_id = c.id and x.status = 'active')
  ),
  signed as (
    select cu.uid, cu.src, count(*)::integer as n from cust cu
     where cu.referred_at >= v_start and cu.referred_at < v_end group by cu.uid, cu.src
  ),
  net as (
    select cu.uid, cu.src, cu.id,
           sum(case when p.amount_total = 0 then 0 else
             div((p.amount_total - p.amount_tax)::numeric * (p.amount_total - p.amount_refunded), p.amount_total::numeric) end)::bigint as cents
      from cust cu join public.payments p on p.user_id = cu.id
     where p.currency = 'usd' and p.created_at >= cu.referred_at and p.created_at >= v_start and p.created_at < v_end
     group by cu.uid, cu.src, cu.id
  ),
  paid as (
    select n.uid, n.src, count(*) filter (where n.cents > 0)::integer as paying, sum(n.cents)::bigint as cents
      from net n group by n.uid, n.src
  )
  select s.user_id, s.role, s.status,
         coalesce(a.amount, 0)::bigint, coalesce(sp.amount, 0)::bigint,
         coalesce(s1.n, 0), coalesce(p1.paying, 0), coalesce(p1.cents, 0)::bigint,
         coalesce(s2.n, 0), coalesce(p2.paying, 0), coalesce(p2.cents, 0)::bigint
    from seats s
    left join alloc a on a.uid = s.user_id
    left join spent sp on sp.uid = s.user_id
    left join signed s1 on s1.uid = s.user_id and s1.src = 'org_l1'
    left join signed s2 on s2.uid = s.user_id and s2.src = 'org_l2'
    left join paid p1 on p1.uid = s.user_id and p1.src = 'org_l1'
    left join paid p2 on p2.uid = s.user_id and p2.src = 'org_l2'
   where s.status = 'active'
      or coalesce(a.amount, 0) <> 0 or coalesce(sp.amount, 0) <> 0
      or coalesce(s1.n, 0) <> 0 or coalesce(p1.cents, 0) <> 0 or coalesce(s2.n, 0) <> 0 or coalesce(p2.cents, 0) <> 0
   order by (s.role = 'owner') desc, s.joined_at, s.user_id;
end;
$$;
revoke all on function public.org_member_stats(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.org_member_stats(uuid, uuid, text) to service_role;
