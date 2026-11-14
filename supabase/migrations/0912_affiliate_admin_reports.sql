create function public.admin_affiliate_overview(p_actor uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_answer jsonb;
begin
  perform public._affiliate_require_admin(p_actor);
  select jsonb_build_object('revenue',r.revenue,'pending',c.pending,'confirmed',c.confirmed,'paid',p.paid,
    'applications',(select count(*) from public.affiliates where status='pending' and application->>'source' is distinct from 'admin_invite'),
    'payout_count',p.due_count,'payout_total',p.due_total,'flagged',c.flagged,
    'errors',(select count(*) from public.affiliate_recompute_errors where resolved_at is null)) into v_answer
  from (select coalesce(sum(div((pay.amount_total-pay.amount_tax)::numeric*(pay.amount_total-pay.amount_refunded),nullif(pay.amount_total,0))),0) revenue
    from public.affiliate_commissions ac join public.payments pay on pay.id=ac.payment_id
    where ac.level=1 and pay.currency='usd' and not exists(select from public.payment_disputes d where d.payment_id=pay.id
      and d.closed_status not in ('won','warning_closed'))) r
  cross join (select coalesce(sum(amount) filter(where status='pending'),0) pending,
    coalesce(sum(amount) filter(where status='confirmed'),0) confirmed,count(*) filter(where cardinality(flags)>0) flagged
    from public.affiliate_commissions) c
  cross join (select coalesce(sum(amount) filter(where status='paid'),0) paid,
    count(*) filter(where status='due' and period=date_trunc('month',now() at time zone 'UTC')::date) due_count,
    coalesce(sum(amount) filter(where status='due' and period=date_trunc('month',now() at time zone 'UTC')::date),0) due_total
    from public.affiliate_payouts) p;
  return v_answer;
end;
$$;
create function public.admin_affiliate_find_user(p_actor uuid,p_query text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_user uuid; v_answer jsonb;
begin
  perform public._affiliate_require_admin(p_actor);
  if p_query ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v_user:=p_query::uuid;
  else select id into v_user from auth.users where email=lower(trim(p_query)) and is_sso_user=false; end if;
  select jsonb_build_object('user_id',u.id,'email',u.email,'referred_by',pr.referred_by,'referred_at',pr.referred_at,
    'referred_source',pr.referred_source,'slug',a.slug) into v_answer from auth.users u join public.profiles pr on pr.id=u.id
    left join public.affiliates a on a.user_id=pr.referred_by where u.id=v_user;
  return v_answer;
end;
$$;

revoke all on function public.admin_affiliate_overview(uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_affiliate_overview(uuid) to service_role;

revoke all on function public.admin_affiliate_find_user(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.admin_affiliate_find_user(uuid,text) to service_role;
