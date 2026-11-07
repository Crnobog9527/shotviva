-- T73 (ARCHITECTURE §6.1 payments, §6.2, §6.3): the Stripe wallet checkout offers Alipay and
-- WeChat Pay together, and payments.method records the one the buyer paid with: `alipay` or
-- `wechat_pay`. Widening only: every existing row still passes, and settle_checkout /
-- apply_subscription_renewal / settle_waffo_order already take p_method as text.
alter table public.payments
  drop constraint payments_method_check,
  add constraint payments_method_check check (method in ('card', 'alipay', 'wechat_pay', 'cn_card'));
