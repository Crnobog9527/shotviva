create function public.affiliate_daily(p_today date) returns void language plpgsql security definer set search_path='' as $$
declare v_settings public.affiliate_settings; v_payment bigint; v_cutoff timestamptz;
begin
  select s.* into strict v_settings from public.affiliate_settings s where singleton;
  if p_today is null then raise exception 'INVALID_INPUT'; end if;
  -- Only one scheduler per UTC period. Payment writes need no global scheduler lock.
  perform pg_advisory_xact_lock(hashtextextended('affiliate_daily:' || p_today::text,0));
  for v_payment in select payment_id from public.affiliate_recompute_errors where resolved_at is null order by payment_id loop
    perform public.affiliate_recompute_payment(v_payment);
  end loop;
  if not v_settings.enabled then return; end if;
  v_cutoff:=case when p_today=(now() at time zone 'UTC')::date then now() else p_today::timestamp at time zone 'UTC' end;
  -- A refund/dispute updates and locks this same commission. EvalPlanQual rechecks pending after waiting.
  with changed as (
    update public.affiliate_commissions c set status='confirmed',confirmed_at=v_cutoff,updated_at=now()
    where c.status='pending' and c.confirm_after<=v_cutoff and (cardinality(c.flags)=0 or c.released_by is not null)
      and not exists(select from public.payment_disputes d where d.payment_id=c.payment_id and
        (d.closed_at is null or d.closed_status not in ('won','warning_closed')))
      and not exists(select from public.affiliate_recompute_errors e where e.payment_id=c.payment_id and e.resolved_at is null)
    returning c.id,c.amount)
  insert into public.affiliate_commission_changes(commission_id,old_amount,new_amount,old_status,new_status,reason)
    select id,amount,amount,'pending','confirmed','confirmed' from changed;
  if extract(day from p_today)<>v_settings.settlement_day then return; end if;
  insert into public.affiliate_payouts(affiliate_user_id,period,amount,payout_snapshot)
    select a.user_id,date_trunc('month',p_today)::date,b.available,
      jsonb_build_object('payout_method',a.payout_method,'payout_details',a.payout_details)
      from public.affiliates a join public.affiliate_balances b on b.affiliate_user_id=a.user_id
     where a.status='active' and a.payout_method is not null and b.available>=v_settings.payout_min_usd
    on conflict(affiliate_user_id,period) do nothing;
end;
$$;

revoke all on function public.affiliate_daily(date) from public,anon,authenticated,service_role;
grant execute on function public.affiliate_daily(date) to service_role;
