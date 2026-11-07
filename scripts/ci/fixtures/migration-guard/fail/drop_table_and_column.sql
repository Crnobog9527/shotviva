-- expect: drop-object, drop-column, drop-column
drop table if exists public.legacy_orders cascade;
alter table public.templates drop column legacy_title, drop if exists old_price;
