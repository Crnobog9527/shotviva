create or replace function public.admin_affiliate_overview(p_actor uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
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
  cross join (select coalesce(sum(coalesce(payout.paid_amount,payout.amount)) filter(where status='paid'),0) paid,
    count(*) filter(where status='due' and period=date_trunc('month',now() at time zone 'UTC')::date) due_count,
    coalesce(sum(public.affiliate_payout_payable(payout)) filter(where status='due' and period=date_trunc('month',now() at time zone 'UTC')::date),0) due_total
    from public.affiliate_payouts payout) p;
  return v_answer;
end;
$$;
