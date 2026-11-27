-- Commissions earned while an org's affiliate account is paused are held, not voided
-- (ARCHITECTURE §6.5, Owner 2026-11-27).
--
-- Until now _affiliate_snapshot marked every payment whose level-1 account was not 'active' as
-- inactive and _affiliate_write_commission voided it for good (void_reason 'affiliate_inactive').
-- Turning an org's affiliate switch off (1643: status 'suspended', suspended_by_org_switch=true)
-- therefore lost every sale made while the switch was off, even after it was turned back on.
--
-- Now:
-- * Paused = the level-1 account is an org account (affiliates.org_id set) in status 'suspended'.
--   That covers the org switch and an admin suspension of an org account: both are reversible
--   (the switch or admin_affiliate_set can make it active again; an admin 'set' of an org row
--   always resends its status, which clears suspended_by_org_switch, so keying on the flag would
--   make an innocent slug edit change money). A personal affiliate's suspension keeps voiding as
--   before, so a suspended personal row never collects held commissions that would block its
--   conversion into an org account (1643 requires no on_hold commissions).
-- * A payment while paused writes the commission with status 'on_hold' and the new column
--   paused_hold=true; the change row's reason is 'affiliate_paused'. It is not in
--   affiliate_balances.pending/available (on_hold never was), is never confirmed by
--   affiliate_daily (that only confirms pending rows) and never paid.
-- * Every recompute of a paused_hold row (refund, dispute, fee update, retry, admin recompute and
--   the trigger below) looks at the current status of the payment's level-1 account:
--   still 'suspended' -> stays on_hold (refunds and disputes still change the amount / void it);
--   'active' -> paused_hold cleared, the normal rules apply (same_ip hold unless released,
--   dispute hold, else pending, or confirmed at once if confirm_after = payment time + hold_days
--   has passed and the fee is ready), change reason 'affiliate_resumed';
--   anything else (banned, rejected, the row gone) -> void 'affiliate_inactive', as today.
-- * Safety net: affiliate_daily also recomputes (at most 500 payments a run, oldest first) every
--   payment that still has a paused_hold commission whose level-1 account is no longer suspended,
--   e.g. if a release ever raced the trigger. Idempotent: a settled row drops paused_hold.
-- * Trigger affiliate_paused_settle: when an account leaves 'suspended', it recomputes every
--   payment with a paused_hold commission whose level-1 row is that account, through
--   affiliate_recompute_payment (payment lock, then commission locks; failures land in
--   affiliate_recompute_errors and affiliate_daily retries them).
-- * The pause hold is separate from the same_ip flag: it is not in flags and ignores released_by,
--   so admin_affiliate_commission_release 'release' still refuses a row without flags
--   (AFFILIATE_NOT_FLAGGED) and releasing a same_ip flag leaves the pause hold in place.
-- * Level 2: an org account has no parent (admin_affiliate_set refuses one, 1643 clears it), and
--   the snapshot still names a parent only for an active level-1 account, so a paused payment has
--   no level-2 row, as before. The code below handles a paused level-2 row the same way
--   (keyed on the level-1 account) should one ever exist.
--
-- Not changed: rows already voided as 'affiliate_inactive' stay void (the reason stays sticky;
-- nothing is restored retroactively), personal accounts, refunds/disputes/fees/payout_retained.
-- Retry snapshots stored before this migration have no 'paused' key and void as before.
--
-- Expand-only: a new column with a default, a partial index, create or replace of _affiliate_snapshot, _affiliate_write_commission and affiliate_daily
-- with the same signatures, and a new trigger. Code before this deploy does not read the column
-- and keeps working (a held row shows as on_hold).

alter table public.affiliate_commissions add column if not exists paused_hold boolean not null default false;
comment on column public.affiliate_commissions.paused_hold is
  'on_hold because the level-1 org account was paused (suspended) at payment time; released when it is active again, voided affiliate_inactive when it is closed (2028).';
create index if not exists affiliate_commissions_paused_idx on public.affiliate_commissions(payment_id) where paused_hold;

-- Same as 2022 plus the 'paused' key.
create or replace function public._affiliate_snapshot(p_payment public.payments) returns jsonb
language sql stable security definer set search_path='' set "TimeZone" to 'UTC' as $$
  select jsonb_build_object('owner',a.user_id,'org',a.org_id,'inactive',a.status<>'active',
    'paused',a.status='suspended' and a.org_id is not null,
    'parent',case when a.status='active' and parent.team_enabled and parent.status='active' then parent.user_id end,
    'rate',case when customer.referred_source='org_l2' then coalesce(o.l2_bp,r.org_l2_bp) else coalesce(o.l1_bp,r.l1_bp) end,
    'bonus',coalesce(po.l2_bp,r.l2_bp),
    'same_ip',not coalesce(customer.referred_source in ('org_l1','org_l2')
        or (a.org_id is not null and customer.referred_source in ('signup','first_checkout')
          and customer.referred_at>=a.approved_at),false)
      and coalesce(customer.signup_ip=referrer.signup_ip,false),
    'confirm_after',p_payment.created_at+make_interval(days=>s.hold_days),
    'void',case when a.org_id is not null and exists(select from public.org_members m
      where m.org_id=a.org_id and m.user_id=customer.id and m.status='active') then 'org_member' end)
    from public.profiles customer join public.affiliates a on a.user_id=customer.referred_by
    join public.profiles referrer on referrer.id=a.user_id
    cross join public.affiliate_settings s
    join admin.catalog_products sku on sku.product_id=p_payment.product_id
    join public.affiliate_rates r on r.product_kind=sku.kind
    left join public.affiliates parent on parent.user_id=a.parent_user_id
    left join public.affiliate_rate_overrides o on (o.user_id,o.product_kind)=(a.user_id,r.product_kind)
    left join public.affiliate_rate_overrides po on (po.user_id,po.product_kind)=(parent.user_id,r.product_kind)
    where s.singleton and customer.id=p_payment.user_id
      and (s.commission_months is null or case
        -- A term extending beyond the payment year always covers this sale. Avoid overflowing
        -- timestamp arithmetic for long terms accepted by the integer setting.
        when s.commission_months > 12 * (1 + extract(year from p_payment.created_at) - extract(year from customer.referred_at)) then true
        else p_payment.created_at <= customer.referred_at + make_interval(months => s.commission_months)
      end);
$$;

-- Same as the current body (1844 / net-of-fees) plus the pause hold.
create or replace function public._affiliate_write_commission(p_payment public.payments, p_snapshot jsonb, p_level smallint,
  p_open boolean, p_lost boolean, p_release boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare
  v_old public.affiliate_commissions; v_id bigint; v_amount bigint; v_status text; v_reason text;
  v_owner uuid; v_rate integer; v_confirm timestamptz; v_flags text[]; v_void text;
  v_fee integer := case when p_payment.fee_status is not null then p_payment.fee_cents end;
  v_net bigint; v_fallback boolean := false;
  v_paused boolean := false; v_resumed boolean := false; v_l1 uuid; v_l1_status text;
begin
  select c.* into v_old from public.affiliate_commissions c where c.payment_id=p_payment.id and c.level=p_level for update;
  if not found then
    v_owner:=(p_snapshot->>case p_level when 1 then 'owner' else 'parent' end)::uuid;
    if v_owner is null then return; end if;
    v_rate:=(p_snapshot->>case p_level when 1 then 'rate' else 'bonus' end)::integer;
    v_confirm:=(p_snapshot->>'confirm_after')::timestamptz;
    v_flags:=case when (p_snapshot->>'same_ip')::boolean then array['same_ip'] else '{}' end;
    if p_level=1 and p_snapshot->>'void'='org_member' then v_void:='org_member';
    elsif coalesce((p_snapshot->>'paused')::boolean,false) then v_paused:=true; v_l1:=(p_snapshot->>'owner')::uuid;
    elsif p_level=1 and (p_snapshot->>'inactive')::boolean then v_void:='affiliate_inactive'; end if;
  else
    v_owner:=v_old.affiliate_user_id; v_rate:=v_old.rate_bp; v_confirm:=v_old.confirm_after; v_flags:=v_old.flags;
    if v_old.void_reason in ('affiliate_inactive','admin_void','org_member') then v_void:=v_old.void_reason;
    elsif v_old.paused_hold then
      v_paused:=true;
      v_l1:=case when p_level=1 then v_old.affiliate_user_id else
        (select c.affiliate_user_id from public.affiliate_commissions c where c.payment_id=p_payment.id and c.level=1) end;
    end if;
  end if;
  -- A pause hold follows the level-1 account as it is now: still suspended -> held, active again ->
  -- normal rules, closed for good (banned, rejected, gone) -> void as before 2028.
  if v_paused then
    -- FOR SHARE conflicts with the status UPDATE (FOR NO KEY UPDATE; KEY SHARE would not): a payment
    -- written while the switch is being turned on waits for that commit and reads the new status,
    -- so it cannot be held after the settle trigger has already run. That trigger never needs this
    -- payment (its commission row is not committed yet), so the wait cannot deadlock.
    select a.status into v_l1_status from public.affiliates a where a.user_id=v_l1 for share;
    if v_l1_status='active' then v_paused:=false; v_resumed:=v_old.id is not null;
    elsif v_l1_status is distinct from 'suspended' then v_paused:=false; v_void:='affiliate_inactive'; end if;
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
  -- A void row is final; it no longer waits for the account.
  if v_amount=0 then v_paused:=false; end if;
  v_status:=case when v_amount=0 then 'void' when p_open or v_paused or (cardinality(v_flags)>0 and v_old.released_by is null and not p_release)
    then 'on_hold' when now()>=v_confirm and (v_old.status='confirmed' or v_fallback or public._affiliate_fee_ready(p_payment,v_confirm,now()))
    then 'confirmed' else 'pending' end;
  if not p_release and v_old.id is not null and (v_amount,v_status,v_void,v_fee::bigint,v_net)
    is not distinct from (v_old.amount,v_old.status,v_old.void_reason,v_old.fee_cents,v_old.net_base_usd) then
    if v_paused is not distinct from v_old.paused_hold then return; end if;
    -- Only the marker changes on a row that was already void (e.g. an admin void while held): no change row.
    if v_status='void' then
      update public.affiliate_commissions set paused_hold=v_paused,updated_at=now() where id=v_old.id;
      return;
    end if;
  end if;
  v_reason:=case when p_release then 'admin_release' when v_void is not null then v_void
    when p_open then 'dispute_open'
    when v_resumed then 'affiliate_resumed'
    when v_paused then case
      when not coalesce(v_old.paused_hold,false) then 'affiliate_paused'
      when v_fee::bigint is distinct from v_old.fee_cents
        then case when p_payment.fee_status='final' then 'fee_final' else 'fee_adjusted' end
      when v_amount<v_old.amount then 'partial_refund'
      else 'affiliate_paused' end
    when v_status='on_hold' then 'same_ip'
    when v_old.status='on_hold' then 'dispute_won'
    when v_status='confirmed' and v_old.status<>'confirmed' and public._affiliate_fee_era(p_payment)
      and p_payment.fee_status is distinct from 'final' then 'confirmed_fee_estimate'
    when v_old.id is not null and v_fee::bigint is distinct from v_old.fee_cents
      then case when p_payment.fee_status='final' then 'fee_final' else 'fee_adjusted' end
    when v_amount<v_old.amount then 'partial_refund'
    when v_status='confirmed' and v_old.id is not null then 'confirmed'
    else 'payment' end;
  insert into public.affiliate_commissions(payment_id,affiliate_user_id,level,product_id,rate_bp,base_usd,amount,status,
    confirm_after,confirmed_at,void_reason,flags,created_at,fee_cents,net_base_usd,paused_hold)
  values(p_payment.id,v_owner,p_level,p_payment.product_id,v_rate,p_payment.amount_total-p_payment.amount_tax,v_amount,v_status,
    v_confirm,case when v_status='confirmed' then now() end,v_void,v_flags,p_payment.created_at,v_fee,v_net,v_paused)
  on conflict(payment_id,level) do update set amount=excluded.amount,status=excluded.status,
    confirmed_at=case when excluded.status='confirmed' then coalesce(affiliate_commissions.confirmed_at,now()) end,
    void_reason=excluded.void_reason,fee_cents=excluded.fee_cents,net_base_usd=excluded.net_base_usd,
    paused_hold=excluded.paused_hold,updated_at=now() returning id into v_id;
  insert into public.affiliate_commission_changes(commission_id,old_amount,new_amount,old_status,new_status,reason)
    values(v_id,v_old.amount,v_amount,v_old.status,v_status,v_reason);
  -- Every path that confirms on the fallback (recompute, daily run, admin release) leaves the alert.
  if v_fallback and v_status='confirmed' then perform public._affiliate_fee_alert_open(p_payment); end if;
end;
$$;

-- An account leaves 'suspended' (org switch back on, admin reactivation, ban): settle its pause holds.
create or replace function public._affiliate_paused_settle() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_payment bigint;
begin
  for v_payment in select distinct c.payment_id from public.affiliate_commissions c
      where c.paused_hold and exists(select from public.affiliate_commissions l1
        where l1.payment_id=c.payment_id and l1.level=1 and l1.affiliate_user_id=new.user_id)
      order by c.payment_id loop
    -- Locks the payment, then its commissions; a failure is recorded for affiliate_daily to retry.
    perform public.affiliate_recompute_payment(v_payment);
  end loop;
  return null;
end;
$$;

revoke all on function public._affiliate_paused_settle() from public,anon,authenticated,service_role;

drop trigger if exists affiliate_paused_settle on public.affiliates;
create trigger affiliate_paused_settle after update of status on public.affiliates
  for each row when (old.status='suspended' and new.status is distinct from 'suspended')
  execute function public._affiliate_paused_settle();

-- Same as the current body plus the pause-hold safety net after the retry loop.
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
  -- 2028: pause holds whose level-1 account is no longer suspended (released or closed), bounded.
  for v_payment in select c.payment_id from public.affiliate_commissions c
      left join public.affiliate_commissions l1 on l1.payment_id=c.payment_id and l1.level=1
      left join public.affiliates a on a.user_id=l1.affiliate_user_id
     where c.paused_hold and a.status is distinct from 'suspended'
     group by c.payment_id order by c.payment_id limit 500 loop
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
