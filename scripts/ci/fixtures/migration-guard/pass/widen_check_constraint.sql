-- expect: none
-- expect-warning: replace-constraint
-- The 0560 shape: a check widened by dropping and re-adding it under the same name.
alter table public.payments
  drop constraint payments_method_check,
  add constraint payments_method_check check (method in ('card', 'alipay', 'wechat_pay', 'cn_card', 'paypal'));
