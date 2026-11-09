-- Reviewed cohort, 6 accounts, paid/free 124/26, one fully refunded payment.
begin;
set local lock_timeout='5s';
select pg_advisory_xact_lock(hashtextextended('shotviva.template_catalog',0));
select admin.clear_approved_wallets_v2('d89a0d8be56fbceac43c362466620f5d53c150266f56eee1cf806d6a6b94d8b4',37,1);
insert into public.system_settings(key,value,updated_at) values('pricing_catalog_version','"v2"',clock_timestamp()) on conflict(key) do nothing;
select admin.activate_template_price_catalog_v2();
select admin.pricing_checkpoint_v2(false);
commit;
