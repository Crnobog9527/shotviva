-- Test accounts and historical fixtures are not covered by the production reset.
-- The CLI sends one prepared statement. PostgreSQL runs this block atomically.
do $$
begin
  set local lock_timeout='5s';
  perform pg_advisory_xact_lock(hashtextextended('shotviva.template_catalog',0));
  insert into public.system_settings(key,value,updated_at) values('pricing_catalog_version','"v2"',clock_timestamp()) on conflict(key) do nothing;
  perform admin.activate_template_price_catalog_v2();
  perform admin.pricing_checkpoint_v2(false);
end;
$$;
