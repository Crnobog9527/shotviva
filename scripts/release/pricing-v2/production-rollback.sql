-- The CLI sends one prepared statement. PostgreSQL runs this block atomically.
do $$
begin
  set local lock_timeout='5s';
  perform pg_advisory_xact_lock(hashtextextended('shotviva.template_catalog',0));
  perform admin.pricing_checkpoint_v2(true);
  perform admin.restore_approved_wallets_v2();
  perform admin.rollback_template_price_catalog_v2();
  delete from public.system_settings where key='pricing_catalog_version' and value='"v2"'::jsonb;
end;
$$;
