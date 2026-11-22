-- A payout threshold of its own for enterprise affiliate accounts (ARCHITECTURE §6.5; Owner
-- 2026-11-22, option 1): one site-wide affiliate_settings.org_payout_min_usd applies to every
-- account with an org_id; personal accounts keep payout_min_usd. No per-org override.
--
-- The new column starts at the current payout_min_usd, so settlement is unchanged until the Owner
-- sets an enterprise number in /admin/affiliates. Code deployed before this migration never reads
-- the column, and its settings form never sends it, so admin_affiliate_settings leaves it as is.

alter table public.affiliate_settings
  add column org_payout_min_usd bigint not null default 20000 check (org_payout_min_usd > 0);

-- Backfill to the live personal threshold (the singleton row only exists once 0901 has run).
update public.affiliate_settings set org_payout_min_usd = payout_min_usd where singleton;

-- Same as 1740 except the issuance threshold: an org account needs org_payout_min_usd, a personal
-- account payout_min_usd.
create or replace function public.affiliate_daily(p_today date) returns void
language plpgsql security definer set search_path='' as $$
declare v_settings public.affiliate_settings; v_payment bigint; v_cutoff timestamptz; v_issue boolean:=false;
begin
  select s.* into strict v_settings from public.affiliate_settings s where singleton;
  if p_today is null then raise exception 'INVALID_INPUT'; end if;
  -- Serialize payout decisions and issuance; payment writes do not take this lock.
  perform pg_advisory_xact_lock(hashtextextended('affiliate_settlement',0));
  for v_payment in select payment_id from public.affiliate_recompute_errors where resolved_at is null order by payment_id loop
    perform public.affiliate_recompute_payment(v_payment);
  end loop;
  -- Mark the scheduled evaluation even when disabled or nobody qualifies.
  -- Any later failure rolls this insert back together with issuance.
  if extract(day from p_today)>=v_settings.settlement_day then
    insert into public.affiliate_settlement_runs(period) values(date_trunc('month',p_today)::date)
      on conflict(period) do nothing;
    v_issue:=found;
  end if;
  if not v_settings.enabled then return; end if;
  v_cutoff:=case when p_today=(now() at time zone 'UTC')::date then now() else p_today::timestamp at time zone 'UTC' end;
  -- Fee-era payments still without fee data once the grace period is over: the recompute applies
  -- _affiliate_fee_fallback, confirms and opens an affiliate_fee_alerts row.
  for v_payment in select distinct c.payment_id from public.affiliate_commissions c join public.payments p on p.id=c.payment_id
     where c.status='pending' and c.confirm_after+make_interval(days=>v_settings.fee_final_grace_days)<=v_cutoff
       and public._affiliate_fee_missing(p) order by c.payment_id loop
    perform public.affiliate_recompute_payment(v_payment);
  end loop;
  -- A refund/dispute updates and locks this same commission. EvalPlanQual rechecks pending after waiting.
  with changed as (
    update public.affiliate_commissions c set status='confirmed',confirmed_at=v_cutoff,updated_at=now()
    where c.status='pending' and c.confirm_after<=v_cutoff and (cardinality(c.flags)=0 or c.released_by is not null)
      and not exists(select from public.payment_disputes d where d.payment_id=c.payment_id and
        (d.closed_at is null or d.closed_status not in ('won','warning_closed')))
      and not exists(select from public.affiliate_recompute_errors e where e.payment_id=c.payment_id and e.resolved_at is null)
      and exists(select from public.payments p where p.id=c.payment_id and public._affiliate_fee_ready(p,c.confirm_after,v_cutoff))
    returning c.id,c.amount,
      (select public._affiliate_fee_era(p) and p.fee_status is distinct from 'final' from public.payments p where p.id=c.payment_id) as on_estimate)
  insert into public.affiliate_commission_changes(commission_id,old_amount,new_amount,old_status,new_status,reason)
    select id,amount,amount,'pending','confirmed',case when on_estimate then 'confirmed_fee_estimate' else 'confirmed' end from changed;
  if not v_issue then return; end if;
  -- One MVCC snapshot for the balance and its commission backing. Refunds that
  -- commit after this statement are measured against these exact amounts at payment.
  with issued as (
    insert into public.affiliate_payouts(affiliate_user_id,period,amount,payout_snapshot,fee_rules)
      select a.user_id,date_trunc('month',p_today)::date,b.available,
        jsonb_build_object('payout_method',a.payout_method,'payout_details',a.payout_details),
        public.affiliate_payout_fee_rules_for('standard',a.payout_method,v_cutoff)
        from public.affiliates a join public.affiliate_balances b on b.affiliate_user_id=a.user_id
       where a.status='active' and a.payout_method is not null and b.available>0
         and b.available>=case when a.org_id is not null then v_settings.org_payout_min_usd else v_settings.payout_min_usd end
      on conflict(affiliate_user_id,period) do nothing returning id,affiliate_user_id,amount)
  insert into public.affiliate_payout_items(payout_id,commission_id,prior_amount,issue_amount)
    select n.id,a.* from issued n
      cross join lateral public._affiliate_allocate_payout(n.affiliate_user_id,n.amount) a;
end;
$$;

-- Same as 1820 except that it also takes org_payout_min_usd (left unchanged when absent, as the
-- form deployed before this migration sends). terms_version is still ignored; the audit is as 1820.
create or replace function public.admin_affiliate_settings(p_actor uuid,p_input jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
  perform public._affiliate_require_admin(p_actor);
  update public.affiliate_settings set enabled=coalesce((p_input->>'enabled')::boolean,enabled),
    commission_months=case when p_input ? 'commission_months' then (p_input->>'commission_months')::integer else commission_months end,
    hold_days=coalesce((p_input->>'hold_days')::integer,hold_days),
    payout_min_usd=coalesce((p_input->>'payout_min_usd')::bigint,payout_min_usd),
    org_payout_min_usd=coalesce((p_input->>'org_payout_min_usd')::bigint,org_payout_min_usd),
    settlement_day=coalesce((p_input->>'settlement_day')::integer,settlement_day),
    apply_min_level=coalesce(p_input->>'apply_min_level',apply_min_level) where singleton;
  insert into public.affiliate_rates(product_kind,l1_bp,l2_bp)
    select r.product_kind,r.l1_bp,r.l2_bp from jsonb_to_recordset(p_input->'rates') r(product_kind text,l1_bp integer,l2_bp integer)
    on conflict(product_kind) do update set l1_bp=excluded.l1_bp,l2_bp=excluded.l2_bp;
  perform public._affiliate_audit(p_actor,'settings','settings',(p_input - 'terms_version')::text);
end;
$$;
