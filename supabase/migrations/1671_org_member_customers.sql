-- The customers behind an org's monthly report (ARCHITECTURE §6.5, card E5, 谁看到什么): for the
-- org owner only, never for staff. Only what §5.5 allows: a masked contact (j***@example.com or
-- 138****5678), when the customer signed up and what they paid. No name, no id, no commission.
-- A customer is listed for a UTC month ('YYYY-MM') when their binding (referred_at) falls in it or
-- they paid in it. Paid is pre-tax, USD cents, net of refunds, as in org_member_stats: the month's
-- figure and the cumulative one (every USD payment since the binding). Customers who have since
-- joined the org as staff are left out. At most 5000 rows; the owner gets NOT_ORG_OWNER otherwise.
create or replace function public.org_member_customers(p_owner uuid, p_period text)
returns table(
  member_user_id uuid, level smallint, contact text, signed_up_at timestamptz,
  paid_in_period_cents bigint, paid_total_cents bigint
)
language plpgsql stable security definer set search_path = '' set "TimeZone" = 'UTC' as $$
#variable_conflict use_column
declare
  v_org uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_account uuid;
begin
  if p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'INVALID_INPUT'; end if;
  select o.id into v_org from public.orgs o where o.owner_user_id = p_owner;
  if v_org is null then raise exception 'NOT_ORG_OWNER'; end if;
  v_start := ((p_period || '-01')::timestamp) at time zone 'UTC';
  v_end := v_start + interval '1 month';
  select a.user_id into v_account from public.affiliates a where a.org_id = v_org;
  if v_account is null then return; end if;

  return query
  with cust as (
    select c.id, c.referred_member as uid, c.referred_source as src, c.referred_at, c.created_at from public.profiles c
     where c.referred_by = v_account and c.referred_member is not null and c.referred_source in ('org_l1', 'org_l2')
       and not exists(select from public.org_members x where x.org_id = v_org and x.user_id = c.id and x.status = 'active')
  ),
  paid as (
    select cu.id,
           coalesce(sum(case when p.amount_total = 0 then 0 else
             div((p.amount_total - p.amount_tax)::numeric * (p.amount_total - p.amount_refunded), p.amount_total::numeric) end)
             filter (where p.created_at >= v_start and p.created_at < v_end), 0)::bigint as in_period,
           coalesce(sum(case when p.amount_total = 0 then 0 else
             div((p.amount_total - p.amount_tax)::numeric * (p.amount_total - p.amount_refunded), p.amount_total::numeric) end), 0)::bigint as total
      from cust cu left join public.payments p on p.user_id = cu.id and p.currency = 'usd' and p.created_at >= cu.referred_at
     group by cu.id
  )
  select cu.uid, case cu.src when 'org_l1' then 1::smallint else 2::smallint end,
         case
           when u.email is not null and u.email like '_%@%' then left(u.email, 1) || '***' || substring(u.email from '@[^@]*$')
           when u.phone ~ '^\+?86[0-9]{11}$' then left(right(u.phone, 11), 3) || '****' || right(u.phone, 4)
           when u.phone is not null and u.phone <> '' then '***' || right(u.phone, 4)
           else ''
         end,
         cu.created_at, pd.in_period, pd.total
    from cust cu join paid pd on pd.id = cu.id left join auth.users u on u.id = cu.id
   where (cu.referred_at >= v_start and cu.referred_at < v_end) or pd.in_period > 0
   order by cu.uid, cu.src, cu.referred_at, cu.id
   limit 5000;
end;
$$;
revoke all on function public.org_member_customers(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.org_member_customers(uuid, text) to service_role;
