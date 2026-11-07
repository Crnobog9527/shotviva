-- expect: drop-constraint
-- Dropping a unique key breaks deployed upserts that use it as their conflict target.
alter table public.payments drop constraint payments_waffo_order_id_key;
