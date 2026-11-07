-- expect: add-constraint, add-constraint
-- The 0360 shape: a new column whose check also constrains an existing one, so rows the
-- deployed code writes (channel = 'waffo', no payment id) are now rejected.
alter table public.payments
  add column waffo_payment_id text check (waffo_payment_id ~ '^PAY_' or channel <> 'waffo'),
  add constraint payments_waffo_payment_ids_check check (channel <> 'waffo' or waffo_payment_id is not null) not valid;
