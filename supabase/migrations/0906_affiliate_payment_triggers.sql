create function public.affiliate_recompute_payment(p_payment_id bigint,p_new_payment boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare
  v_payment public.payments; v_enabled boolean; v_open boolean; v_lost boolean; v_snapshot jsonb;
  v_exists boolean; v_retry boolean;
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
create function public._affiliate_payment_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='payments' then perform public.affiliate_recompute_payment(new.id,tg_op='INSERT');
  else perform public.affiliate_recompute_payment(new.payment_id); end if;
  return null;
end;
$$;
create trigger affiliate_payment_insert after insert on public.payments
  for each row execute function public._affiliate_payment_event();
create trigger affiliate_payment_update after update of status,amount_refunded on public.payments
  for each row when ((old.status,old.amount_refunded) is distinct from (new.status,new.amount_refunded))
  execute function public._affiliate_payment_event();
create trigger affiliate_dispute_insert after insert on public.payment_disputes
  for each row when (new.payment_id is not null) execute function public._affiliate_payment_event();
create trigger affiliate_dispute_update after update of closed_at,closed_status on public.payment_disputes
  for each row when (new.payment_id is not null and (old.closed_at,old.closed_status) is distinct from (new.closed_at,new.closed_status))
  execute function public._affiliate_payment_event();
create index affiliate_disputes_payment_idx on public.payment_disputes(payment_id) where payment_id is not null;

revoke all on function public.affiliate_recompute_payment(bigint,boolean) from public,anon,authenticated,service_role;
grant execute on function public.affiliate_recompute_payment(bigint,boolean) to service_role;

revoke all on function public._affiliate_payment_event() from public,anon,authenticated,service_role;
