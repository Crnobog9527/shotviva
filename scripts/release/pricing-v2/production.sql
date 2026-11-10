-- The CLI sends one prepared statement. PostgreSQL runs this block atomically.
do $$
begin
  set local lock_timeout='5s';
  perform pg_advisory_xact_lock(hashtextextended('shotviva.template_catalog',0));
  -- A replay sees the closed wallets. The cutover RPC verifies the original digest.
  if not exists (select from admin.pricing_wallet_cutover where version='v2') then
    lock table public.profiles in share row exclusive mode;
    if (select count(*) <> {{accounts}} or coalesce(sum(credits),0) <> {{paid_credits}}
          or coalesce(sum(free_credits),0) <> {{free_credits}} from public.profiles) then
      raise exception 'CUTOVER_BASELINE_CHANGED';
    end if;
  end if;
  perform admin.clear_approved_wallets_v2('{{digest}}',{{last_ledger}},{{payments}});
  insert into public.system_settings(key,value,updated_at) values('pricing_catalog_version','"v2"',clock_timestamp()) on conflict(key) do nothing;
  perform admin.activate_template_price_catalog_v2();
  perform admin.pricing_checkpoint_v2(false);
end;
$$;
