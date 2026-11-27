-- This month's promotion credits for an enterprise channel partner's owner (ARCHITECTURE §6.5
-- 渠道商推广积分): a read-only card on the owner's enterprise affiliate dashboard. Granted is the
-- confirmed monthly sheet plus the ad-hoc top-ups for the current UTC month; they all expire at the
-- month's end. Remaining is what the month-end expiry would take back now: the bucket's remainder
-- (1847, _partner_promo_bucket_left) for this org's rows, never more than the recipient's free
-- balance (the expiry takes no more than that either).
--
-- Adds one function only. Called by the server with the service role after the page has checked
-- that the signed-in account is the org's affiliate account (core/affiliate/partners); never
-- callable by clients.

create function public.org_promo_month(p_org uuid, p_now timestamptz default now())
returns table(
  promo_partner boolean,
  period text,
  monthly integer,
  topups integer,
  expires_at timestamptz,
  remaining integer
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_period text := to_char(p_now at time zone 'UTC', 'YYYY-MM');
  v_partner boolean;
  v_monthly integer;
  v_topups integer;
  v_expires timestamptz;
  v_left bigint := 0;
  b record;
begin
  select o.promo_partner into v_partner from public.orgs o where o.id = p_org;
  if v_partner is null then return; end if;
  select coalesce(sum(g.total), 0)::integer, min(g.expires_at) into v_monthly, v_expires
    from public.partner_promo_grants g
   where g.org_id = p_org and g.period = v_period and g.status = 'granted';
  select coalesce(sum(t.credits), 0)::integer, least(v_expires, min(t.expires_at)) into v_topups, v_expires
    from public.partner_promo_topups t
   where t.org_id = p_org and t.period = v_period;
  -- Each (recipient, expiry) bucket the org's rows sit in; normally one.
  for b in
    select x.u, x.e, sum(x.k)::bigint as own from (
      select g.recipient_user_id as u, g.expires_at as e, 1 as k from public.partner_promo_grants g
       where g.org_id = p_org and g.period = v_period and g.status = 'granted'
      union all
      select t.recipient_user_id, t.expires_at, 1 from public.partner_promo_topups t
       where t.org_id = p_org and t.period = v_period
    ) x group by x.u, x.e
  loop
    v_left := v_left + least(
      coalesce((select p.free_credits from public.profiles p where p.id = b.u), 0),
      coalesce((select sum(l.credits_left) from public._partner_promo_bucket_left(b.u, b.e) l
                 where (l.source = 'grant' and exists (select 1 from public.partner_promo_grants g
                                                       where g.id = l.source_id and g.org_id = p_org and g.period = v_period))
                    or (l.source = 'topup' and exists (select 1 from public.partner_promo_topups t
                                                       where t.id = l.source_id and t.org_id = p_org and t.period = v_period))), 0));
  end loop;
  return query select v_partner, v_period, v_monthly, v_topups, v_expires,
    case when v_expires is not null and v_expires <= p_now then 0 else v_left::integer end;
end;
$$;
revoke all on function public.org_promo_month(uuid, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.org_promo_month(uuid, timestamptz) to service_role;
