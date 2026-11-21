-- F5 (ARCHITECTURE §6.2 联盟返佣 · 佣金扣手续费): commissions on payments that carry fee data
-- (payments.fee_status set by payment_fee_record, F2) are computed on the base net of that
-- payment's processing fees. Every other payment (before payment_fee_settings.record_from, or
-- with no fee data) keeps the exact old formula; nothing already written changes.
--
--   G = amount_total − amount_tax                  pre-tax paid, USD cents
--   B = max(0, floor(G × (amount_total − amount_refunded) / amount_total) − fee_cents)
--   commission = floor(B × rate_bp / 10000)
--
-- fee_cents is the payment's current fee total: the charge's own fees plus every refund's fee
-- line, so the original fee is deducted in full from the unrefunded part (the Owner, plan 5.1
-- decision 4) and a refund fee is deducted on its own payment. A full refund gives B = 0. Both
-- levels (personal level 1 and team bonus; org level 1 and org level 2) use the same B.
--
-- Confirmation after the hold also needs the fees settled: a payment of the fee era (fee data, or
-- created at/after record_from) confirms when fee_status = 'final', or, when F4 never finalises
-- it, on the estimate once affiliate_settings.fee_final_grace_days have passed after the hold.
-- With no fee data at all (F3 missed it), it waits the same grace period, then confirms on the
-- published acquiring rate in force at payment (_affiliate_fee_fallback: a lower bound, never
-- above the real fee) and opens a row in affiliate_fee_alerts until fee data arrives (the fee
-- write's recompute resolves it). Not affiliate_recompute_errors: an open error there blocks
-- marking that affiliate's payouts paid (AFFILIATE_PAYOUT_RECOMPUTE_PENDING).
-- A commission already confirmed stays confirmed when a later refund-fee estimate reopens the
-- payment's fee status; a fee correction after confirmation changes the amount like a refund
-- does (balance may go negative, offset by future commissions).

alter table public.affiliate_commissions
  add column fee_cents bigint check (fee_cents >= 0),
  add column net_base_usd bigint check (net_base_usd >= 0);
comment on column public.affiliate_commissions.fee_cents is
  'Payment fees deducted for this commission (payments.fee_cents at the last recompute). NULL = old formula, no fee deducted.';
comment on column public.affiliate_commissions.net_base_usd is
  'Commission base after tax, refunds and fees: max(0, unrefunded pre-tax paid − fee_cents). NULL = old formula.';

alter table public.affiliate_settings
  add column fee_final_grace_days integer not null default 14 check (fee_final_grace_days between 0 and 365);
comment on column public.affiliate_settings.fee_final_grace_days is
  'Days after confirm_after a fee-era commission waits for final fees before it confirms on the estimate.';

-- One row per fee-era payment whose commission confirmed with no fee data (kind fees_missing),
-- with the fallback fee used. Open while resolved_at is NULL; reopened if it happens again.
create table public.affiliate_fee_alerts (
  payment_id bigint primary key references public.payments(id) on delete cascade,
  kind text not null check (kind in ('fees_missing')),
  fee_cents integer not null check (fee_cents >= 0),
  opened_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index affiliate_fee_alerts_open_idx on public.affiliate_fee_alerts(opened_at desc) where resolved_at is null;
alter table public.affiliate_fee_alerts enable row level security;
revoke all on public.affiliate_fee_alerts from public,anon,authenticated,service_role;
grant select on public.affiliate_fee_alerts to service_role;

-- B: the unrefunded pre-tax paid minus the fee, floor 0. NULL fee gives NULL (strict).
create function public._affiliate_net_base(p_total integer, p_tax integer, p_refunded integer, p_fee integer)
returns bigint language sql immutable strict set search_path='' as $$
  select case when p_total = 0 then 0 else
    greatest(0, div((p_total - p_tax)::numeric * (p_total - p_refunded), p_total::numeric) - p_fee)::bigint end;
$$;
revoke all on function public._affiliate_net_base(integer,integer,integer,integer) from public,anon,authenticated,service_role;

-- The fee-aware due. A NULL fee is the old formula, unchanged (the 4-argument version stays).
create function public._affiliate_due(p_total integer, p_tax integer, p_refunded integer, p_rate integer, p_fee integer)
returns bigint language sql immutable set search_path='' as $$
  select case when p_fee is null then public._affiliate_due(p_total, p_tax, p_refunded, p_rate)
    else div(public._affiliate_net_base(p_total, p_tax, p_refunded, p_fee)::numeric * p_rate, 10000)::bigint end;
$$;
revoke all on function public._affiliate_due(integer,integer,integer,integer,integer) from public,anon,authenticated,service_role;

-- The payment is of the fee era: it carries fee data, or it was made once fees are recorded.
create function public._affiliate_fee_era(p_payment public.payments)
returns boolean language sql stable security definer set search_path='' as $$
  select p_payment.fee_status is not null or coalesce(
    (select p_payment.created_at >= s.record_from from public.payment_fee_settings s where s.singleton), false);
$$;
revoke all on function public._affiliate_fee_era(public.payments) from public,anon,authenticated,service_role;

-- The fee assumed for a fee-era payment that never got fee data: the published acquiring rate
-- for its channel and method in force at payment, on the tax-inclusive amount; 0 without one.
create function public._affiliate_fee_fallback(p_payment public.payments)
returns integer language sql stable security definer set search_path='' as $$
  select coalesce((select public.payment_fee_amount(p_payment.amount_total, s.rate_bp, s.fixed_cents, s.rounding)
    from public.payment_fee_schedule_for(p_payment.channel, p_payment.method, 'acquiring', p_payment.created_at) s
   where s.id is not null), 0);
$$;
revoke all on function public._affiliate_fee_fallback(public.payments) from public,anon,authenticated,service_role;

-- A fee-era payment without any fee data.
create function public._affiliate_fee_missing(p_payment public.payments)
returns boolean language sql stable security definer set search_path='' as $$
  select p_payment.fee_status is null and public._affiliate_fee_era(p_payment);
$$;
revoke all on function public._affiliate_fee_missing(public.payments) from public,anon,authenticated,service_role;

-- Opens (or reopens) the fees_missing alert of a payment confirmed on _affiliate_fee_fallback.
create function public._affiliate_fee_alert_open(p_payment public.payments) returns void
language sql security definer set search_path='' as $$
  insert into public.affiliate_fee_alerts(payment_id,kind,fee_cents)
    values(p_payment.id,'fees_missing',public._affiliate_fee_fallback(p_payment))
    on conflict(payment_id) do update set fee_cents=excluded.fee_cents,opened_at=now(),resolved_at=null
    where affiliate_fee_alerts.resolved_at is not null;
$$;
revoke all on function public._affiliate_fee_alert_open(public.payments) from public,anon,authenticated,service_role;

-- May a commission of this payment, due at p_confirm, confirm at p_at as far as fees go.
create function public._affiliate_fee_ready(p_payment public.payments, p_confirm timestamptz, p_at timestamptz)
returns boolean language sql stable security definer set search_path='' as $$
  select not public._affiliate_fee_era(p_payment) or p_payment.fee_status = 'final'
      or (p_payment.fee_status = 'estimated'
          and p_at >= p_confirm + make_interval(days => (select s.fee_final_grace_days from public.affiliate_settings s where s.singleton)));
$$;
revoke all on function public._affiliate_fee_ready(public.payments,timestamptz,timestamptz) from public,anon,authenticated,service_role;

-- Same as 1645 except: the fee-aware due and the stored fee_cents / net_base_usd; confirmation
-- also waits for _affiliate_fee_ready unless the commission is already confirmed; fee changes
-- are recorded as fee_final / fee_adjusted, and a confirmation on the estimate as
-- confirmed_fee_estimate. A fee-era payment with no fee data takes _affiliate_fee_fallback as its
-- fee once the grace period after confirm_after has passed, and may then confirm; confirming on
-- it opens the payment's affiliate_fee_alerts row, whichever caller (incl. admin release) it is.
create or replace function public._affiliate_write_commission(p_payment public.payments,p_snapshot jsonb,p_level smallint,
  p_open boolean,p_lost boolean,p_release boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare
  v_old public.affiliate_commissions; v_id bigint; v_amount bigint; v_status text; v_reason text;
  v_owner uuid; v_rate integer; v_confirm timestamptz; v_flags text[]; v_void text;
  v_fee integer := case when p_payment.fee_status is not null then p_payment.fee_cents end;
  v_net bigint; v_fallback boolean := false;
begin
  select c.* into v_old from public.affiliate_commissions c where c.payment_id=p_payment.id and c.level=p_level for update;
  if not found then
    v_owner:=(p_snapshot->>case p_level when 1 then 'owner' else 'parent' end)::uuid;
    if v_owner is null then return; end if;
    v_rate:=(p_snapshot->>case p_level when 1 then 'rate' else 'bonus' end)::integer;
    v_confirm:=(p_snapshot->>'confirm_after')::timestamptz;
    v_flags:=case when (p_snapshot->>'same_ip')::boolean then array['same_ip'] else '{}' end;
    if p_level=1 and (p_snapshot->>'inactive')::boolean then v_void:='affiliate_inactive';
    elsif p_level=1 and p_snapshot->>'void'='org_member' then v_void:='org_member'; end if;
  else
    v_owner:=v_old.affiliate_user_id; v_rate:=v_old.rate_bp; v_confirm:=v_old.confirm_after; v_flags:=v_old.flags;
    if v_old.void_reason in ('affiliate_inactive','admin_void','org_member') then v_void:=v_old.void_reason; end if;
  end if;
  if public._affiliate_fee_missing(p_payment) and now() >= v_confirm
     + make_interval(days => (select s.fee_final_grace_days from public.affiliate_settings s where s.singleton)) then
    v_fallback:=true; v_fee:=public._affiliate_fee_fallback(p_payment);
  end if;
  v_net:=public._affiliate_net_base(p_payment.amount_total,p_payment.amount_tax,p_payment.amount_refunded,v_fee);
  v_amount:=public._affiliate_due(p_payment.amount_total,p_payment.amount_tax,p_payment.amount_refunded,v_rate,v_fee);
  if v_old.payout_retained is not null then
    v_amount:=public._affiliate_retained_cents(v_old.payout_retained,v_amount);
  end if;
  if v_void is not null or p_lost then
    v_void:=coalesce(v_void,'dispute_lost'); v_amount:=0;
  elsif v_amount=0 then
    v_void:=case when p_payment.amount_refunded=p_payment.amount_total then 'refunded' else 'zero' end;
  end if;
  v_status:=case when v_amount=0 then 'void' when p_open or (cardinality(v_flags)>0 and v_old.released_by is null and not p_release)
    then 'on_hold' when now()>=v_confirm and (v_old.status='confirmed' or v_fallback or public._affiliate_fee_ready(p_payment,v_confirm,now()))
    then 'confirmed' else 'pending' end;
  if not p_release and v_old.id is not null and (v_amount,v_status,v_void,v_fee::bigint,v_net)
    is not distinct from (v_old.amount,v_old.status,v_old.void_reason,v_old.fee_cents,v_old.net_base_usd) then return; end if;
  v_reason:=case when p_release then 'admin_release' when v_void is not null then v_void
    when p_open then 'dispute_open' when v_status='on_hold' then 'same_ip'
    when v_old.status='on_hold' then 'dispute_won'
    when v_status='confirmed' and v_old.status<>'confirmed' and public._affiliate_fee_era(p_payment)
      and p_payment.fee_status is distinct from 'final' then 'confirmed_fee_estimate'
    when v_old.id is not null and v_fee::bigint is distinct from v_old.fee_cents
      then case when p_payment.fee_status='final' then 'fee_final' else 'fee_adjusted' end
    when v_amount<v_old.amount then 'partial_refund'
    when v_status='confirmed' and v_old.id is not null then 'confirmed'
    else 'payment' end;
  insert into public.affiliate_commissions(payment_id,affiliate_user_id,level,product_id,rate_bp,base_usd,amount,status,
    confirm_after,confirmed_at,void_reason,flags,created_at,fee_cents,net_base_usd)
  values(p_payment.id,v_owner,p_level,p_payment.product_id,v_rate,p_payment.amount_total-p_payment.amount_tax,v_amount,v_status,
    v_confirm,case when v_status='confirmed' then now() end,v_void,v_flags,p_payment.created_at,v_fee,v_net)
  on conflict(payment_id,level) do update set amount=excluded.amount,status=excluded.status,
    confirmed_at=case when excluded.status='confirmed' then coalesce(affiliate_commissions.confirmed_at,now()) end,
    void_reason=excluded.void_reason,fee_cents=excluded.fee_cents,net_base_usd=excluded.net_base_usd,
    updated_at=now() returning id into v_id;
  insert into public.affiliate_commission_changes(commission_id,old_amount,new_amount,old_status,new_status,reason)
    values(v_id,v_old.amount,v_amount,v_old.status,v_status,v_reason);
  -- Every path that confirms on the fallback (recompute, daily run, admin release) leaves the alert.
  if v_fallback and v_status='confirmed' then perform public._affiliate_fee_alert_open(p_payment); end if;
end;
$$;

-- Same as 1592 except the confirmation step: a fee-era payment's commissions confirm only when
-- _affiliate_fee_ready, and a confirmation on the estimate is recorded as confirmed_fee_estimate.
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
       where a.status='active' and a.payout_method is not null and b.available>0 and b.available>=v_settings.payout_min_usd
      on conflict(affiliate_user_id,period) do nothing returning id,affiliate_user_id,amount)
  insert into public.affiliate_payout_items(payout_id,commission_id,prior_amount,issue_amount)
    select n.id,a.* from issued n
      cross join lateral public._affiliate_allocate_payout(n.affiliate_user_id,n.amount) a;
end;
$$;

-- Same as 0906 except the end of a successful recompute: when a commission of a fee-era payment
-- with no fee data is confirmed (on _affiliate_fee_fallback), an affiliate_fee_alerts row is
-- opened; once the payment has fee data, its open alert is resolved.
create or replace function public.affiliate_recompute_payment(p_payment_id bigint,p_new_payment boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare
  v_payment public.payments; v_enabled boolean; v_open boolean; v_lost boolean; v_snapshot jsonb;
  v_exists boolean; v_retry boolean; v_missing boolean;
begin
  if p_payment_id is null then return; end if;
  select enabled into strict v_enabled from public.affiliate_settings where singleton;
  if p_new_payment and not v_enabled then return; end if;
  select exists(select from public.affiliate_commissions c where c.payment_id=p_payment_id) into v_exists;
  select e.snapshot into v_snapshot from public.affiliate_recompute_errors e where e.payment_id=p_payment_id and e.resolved_at is null;
  v_retry:=found;
  if not (v_exists or v_retry or (p_new_payment and v_enabled)) then return; end if;
  -- Serializes manual/cron retries with the existing billing transaction on this payment.
  select p.* into strict v_payment from public.payments p where p.id=p_payment_id for update;
  if v_payment.amount_total=0 then return; end if;
  if not v_exists and v_snapshot is null then v_snapshot:=public._affiliate_snapshot(v_payment); end if;
  if not v_exists and v_snapshot is null then
    if v_retry then update public.affiliate_recompute_errors set resolved_at=now() where payment_id=p_payment_id and resolved_at is null; end if;
    return;
  end if;
  if v_payment.currency <> 'usd' then raise exception 'AFFILIATE_NON_USD_PAYMENT'; end if;
  select is_open,is_lost into strict v_open,v_lost from public._affiliate_dispute_state(v_payment);
  perform public._affiliate_write_commission(v_payment,v_snapshot,1::smallint,v_open,v_lost);
  perform public._affiliate_write_commission(v_payment,v_snapshot,2::smallint,v_open,v_lost);
  update public.affiliate_recompute_errors set resolved_at=now() where payment_id=p_payment_id and resolved_at is null;
  v_missing:=public._affiliate_fee_missing(v_payment);
  if v_missing and exists(select from public.affiliate_commissions c where c.payment_id=p_payment_id and c.status='confirmed') then
    perform public._affiliate_fee_alert_open(v_payment);
  elsif not v_missing then
    update public.affiliate_fee_alerts set resolved_at=now() where payment_id=p_payment_id and resolved_at is null;
  end if;
exception when others or query_canceled or assert_failure then
  -- Retain no sensitive exception DETAIL/CONTEXT (it can contain an entire failed row).
  begin
    insert into public.affiliate_recompute_errors(payment_id,error,snapshot)
      values(p_payment_id,sqlstate || ': ' || left(sqlerrm,300),v_snapshot)
      on conflict(payment_id) where resolved_at is null do update set error=excluded.error,
        snapshot=coalesce(affiliate_recompute_errors.snapshot,excluded.snapshot);
  exception when others or query_canceled or assert_failure then
    -- Even an unavailable error sink must never undo a successful payment/credit write.
    return;
  end;
end;
$$;

-- A fee write (payment_fee_record → _payment_fee_refresh, in the fee writer's transaction)
-- recomputes the payment's commissions, like a refund. affiliate_recompute_payment never raises,
-- so a commission problem can never undo the fee write.
create trigger affiliate_payment_fee_update after update of fee_cents,fee_status on public.payments
  for each row when ((old.fee_cents,old.fee_status) is distinct from (new.fee_cents,new.fee_status))
  execute function public._affiliate_payment_event();
