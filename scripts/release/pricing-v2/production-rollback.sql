begin;
set local lock_timeout='5s';
select pg_advisory_xact_lock(hashtextextended('shotviva.template_catalog',0));
select admin.restore_approved_wallets_v2();
select admin.rollback_template_price_catalog_v2();
delete from public.system_settings where key='pricing_catalog_version' and value='"v2"'::jsonb;
commit;
