create function public.affiliate_partner_summary(p_user uuid) returns jsonb language sql stable security definer set search_path='' as $$
  with settings as (
    select s.settlement_day,(now() at time zone 'UTC')::date today from public.affiliate_settings s where s.singleton
  ), dates as (
    select today, (date_trunc('month',today)::date+(settlement_day-1)) this_settlement from settings
  ), period as (
    select today,case when this_settlement>today then this_settlement else (this_settlement+interval '1 month')::date end next_day from dates
  )
  select jsonb_build_object(
    'clicks',(select coalesce(sum(clicks),0) from public.affiliate_click_days where affiliate_user_id=p_user and day between t.today-29 and t.today),
    'referred',r.referred,'paidUsers',r.paid_users,'pending',b.pending,'available',b.available,'paid',b.paid,
    'maturing',(select coalesce(sum(amount),0) from public.affiliate_commissions where affiliate_user_id=p_user and status='pending'
      and (confirm_after at time zone 'UTC')::date<=t.next_day),
    'nextSettlement',t.next_day)
  from public.affiliate_balances b cross join period t cross join lateral (
    select count(*) referred,count(*) filter(where exists(select from public.payments p where p.user_id=c.id)) paid_users
      from public.profiles c where c.referred_by=p_user
  ) r where b.affiliate_user_id=p_user;
$$;
create function public.affiliate_partner_referrals(p_user uuid,p_before_at timestamptz default null,p_before_id text default null)
returns table(masked_hash text,referred_at timestamptz,payment_count bigint,commission_amount bigint)
language sql stable security definer set search_path='' as $$
  with page as (
    select c.id,c.referred_at,encode(sha256(convert_to(c.id::text,'UTF8')),'hex') masked_hash
    from public.profiles c where c.referred_by=p_user and (p_before_at is null or
      (c.referred_at,encode(sha256(convert_to(c.id::text,'UTF8')),'hex'))<(p_before_at,p_before_id))
    order by c.referred_at desc,masked_hash desc limit 31
  ) select pg.masked_hash,pg.referred_at,count(p.id),coalesce(sum(c.amount),0)::bigint from page pg
    left join public.payments p on p.user_id=pg.id
    left join public.affiliate_commissions c on c.payment_id=p.id and c.level=1 and c.affiliate_user_id=p_user
    group by pg.masked_hash,pg.referred_at order by pg.referred_at desc,pg.masked_hash desc;
$$;

revoke all on function public.affiliate_partner_summary(uuid) from public,anon,authenticated,service_role;
grant execute on function public.affiliate_partner_summary(uuid) to service_role;

revoke all on function public.affiliate_partner_referrals(uuid,timestamptz,text) from public,anon,authenticated,service_role;
grant execute on function public.affiliate_partner_referrals(uuid,timestamptz,text) to service_role;
