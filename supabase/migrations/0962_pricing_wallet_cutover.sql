-- Install only. The release transaction (not this migration) locks, snapshots and clears
-- exactly the owner-approved cohort, paired with activating the template catalog.
create table admin.pricing_wallet_cutover (
  version text primary key check (version = 'v2'),
  started_at timestamptz not null,
  digest_before text not null,
  waived_refunds jsonb not null,
  last_ledger_after bigint not null,
  rolled_back_at timestamptz
);
alter table admin.pricing_wallet_cutover enable row level security;
revoke all on admin.pricing_wallet_cutover from public, anon, authenticated, service_role;

create function admin.wallet_digest_v2() returns text language sql stable set search_path='' as $$
  select encode(sha256(convert_to(coalesce(string_agg(id::text||':'||credits::text||':'||free_credits::text,',' order by id),''),'UTF8')),'hex')
  from public.profiles;
$$;

create function admin.clear_approved_wallets_v2(p_digest text, p_last_ledger bigint, p_payments bigint)
returns void language plpgsql set search_path='' as $$
declare rec record; prior admin.pricing_wallet_cutover; stamp timestamptz; waivers jsonb := '[]'; waived jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('shotviva.template_catalog',0));
  lock table public.profiles, public.generation_jobs, public.credit_ledger, public.payments, public.subscriptions in share row exclusive mode;
  select * into prior from admin.pricing_wallet_cutover where version='v2';
  if found then
    if prior.digest_before is distinct from p_digest or prior.rolled_back_at is not null then raise exception 'CUTOVER_BATCH_MISMATCH'; end if;
    return;
  end if;
  if admin.wallet_digest_v2() is distinct from p_digest or
     (select coalesce(max(id),0) from public.credit_ledger) is distinct from p_last_ledger or
     (select count(*) from public.payments) is distinct from p_payments or
     exists(select from public.payments where status <> 'refunded' or amount_refunded <> amount_total) or
     exists(select from public.payment_disputes where closed_at is null) or
     exists(select from public.profiles where paid_until > now()) or
     exists(select from public.subscriptions where status not in ('canceled','incomplete_expired')) or
     exists(select from public.generation_jobs where status='running') then
    raise exception 'CUTOVER_BASELINE_CHANGED';
  end if;
  stamp := clock_timestamp();
  for rec in select id,credits,free_credits from public.profiles where credits<>0 or free_credits<>0 order by id loop
    if rec.credits>0 then
      perform public.admin_adjust_credits(rec.id,-rec.credits,'Legacy balance closed at pricing switch','paid','pricing:v2:close:paid:'||rec.id);
    end if;
    if rec.free_credits>0 then
      perform public.admin_adjust_credits(rec.id,-rec.free_credits,'Legacy balance closed at pricing switch','free','pricing:v2:close:free:'||rec.id);
    end if;
  end loop;
  -- All approved balances are now zero. Record uncollected old refunds as waived, so
  -- a replay cannot collect the old debt from a later purchase in the new denomination.
  for rec in select id,clawback_shortfall from public.payments where status='refunded' order by id loop
    waived := public.clawback_payment_credits(rec.id,'cutover_v2','Legacy refund waived at pricing switch');
    if (waived->>'taken')::int<>0 then raise exception 'UNEXPECTED_CUTOVER_DEBIT'; end if;
    if (waived->>'written_off')::int>0 then
      waivers := waivers || jsonb_build_array(jsonb_build_object('id',rec.id,'before',rec.clawback_shortfall,'after',waived->'clawback_shortfall'));
    end if;
  end loop;
  insert into admin.pricing_wallet_cutover(version,started_at,digest_before,waived_refunds,last_ledger_after)
    select 'v2',stamp,p_digest,waivers,coalesce(max(id),0) from public.credit_ledger;
end;
$$;

create function admin.restore_approved_wallets_v2() returns void language plpgsql set search_path='' as $$
declare rec record; batch admin.pricing_wallet_cutover;
begin
  perform pg_advisory_xact_lock(hashtextextended('shotviva.template_catalog',0));
  lock table public.profiles, public.generation_jobs, public.credit_ledger, public.payments, public.subscriptions in share row exclusive mode;
  select * into strict batch from admin.pricing_wallet_cutover where version='v2';
  if batch.rolled_back_at is not null then return; end if;
  if (select coalesce(max(id),0) from public.credit_ledger)<>batch.last_ledger_after or
     exists(select from public.profiles where created_at >= batch.started_at) or
     exists(select from public.payments where created_at >= batch.started_at) or
     exists(select from public.generation_jobs where created_at >= batch.started_at or status='running') then
    raise exception 'ECONOMIC_ACTIVITY_AFTER_CUTOVER';
  end if;
  for rec in select * from jsonb_to_recordset(batch.waived_refunds) as x(id bigint,"before" integer,"after" integer) loop
    update public.payments set clawback_shortfall=rec.before where id=rec.id and clawback_shortfall=rec.after and status='refunded';
    if not found then raise exception 'REFUND_CHANGED_AFTER_CUTOVER'; end if;
  end loop;
  for rec in select user_id,pool,delta from public.credit_ledger where idempotency_key like 'pricing:v2:close:%' order by id loop
    perform public.admin_adjust_credits(rec.user_id,-rec.delta,'Pricing rollback restores legacy balance',rec.pool,'pricing:v2:restore:'||rec.pool||':'||rec.user_id);
  end loop;
  if admin.wallet_digest_v2()<>batch.digest_before then raise exception 'RESTORED_WALLET_MISMATCH'; end if;
  update admin.pricing_wallet_cutover set rolled_back_at=clock_timestamp() where version='v2';
end;
$$;

revoke all on function admin.wallet_digest_v2(), admin.clear_approved_wallets_v2(text,bigint,bigint),
  admin.restore_approved_wallets_v2() from public, anon, authenticated, service_role;
