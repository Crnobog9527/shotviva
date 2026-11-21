-- F2 (ARCHITECTURE §6.2 联盟返佣 · 订单手续费): the providers' published processing-fee rates, one
-- row per channel × payment method × fee kind × version. Fee lines (1701) point at the row they
-- were priced with, so a rate is never edited in place: a new rate is a new row with a later
-- effective_from, and a row can only be switched off. Only the admin function in 1703 writes it.
create table public.payment_fee_schedules (
  id bigint generated always as identity primary key,
  channel text not null check (channel in ('stripe','waffo')),
  -- payments.method values (0560): Waffo Apple Pay / Google Pay are recorded as card (F0).
  method text not null check (method in ('card','cn_card','alipay','wechat_pay')),
  kind text not null check (kind in ('acquiring','intl_card','fx','mp','billing','radar','refund_fee')),
  rate_bp integer not null default 0 check (rate_bp between 0 and 10000),
  fixed_cents integer not null default 0 check (fixed_cents between 0 and 100000),
  -- How the percentage part is rounded to the cent: Stripe rounds half up, Waffo rounds up
  -- (F1: ceil(3.9% × amount + $0.50) matched 11 of 11 settled payments, half-up only 9).
  rounding text not null default 'half_up' check (rounding in ('half_up','ceil')),
  effective_from timestamptz not null,
  active boolean not null default true,
  note text check (note is null or length(note) <= 500),
  -- NULL: seeded by a migration.
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint payment_fee_schedules_nonzero check (rate_bp > 0 or fixed_cents > 0)
);
create unique index payment_fee_schedules_version_key
  on public.payment_fee_schedules (channel, method, kind, effective_from) where active;

alter table public.payment_fee_schedules enable row level security;
revoke all on public.payment_fee_schedules from public,anon,authenticated,service_role;
grant select on public.payment_fee_schedules to service_role;
revoke all on sequence public.payment_fee_schedules_id_seq from public,anon,authenticated,service_role;

-- Rates are history: fee lines quote them. Only active, note and the who/when columns may change
-- (created_by / updated_by are set null when that admin's account is deleted).
create function public._payment_fee_schedule_immutable() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op = 'DELETE' then raise exception 'PAYMENT_FEE_SCHEDULE_IMMUTABLE'; end if;
  if (new.channel,new.method,new.kind,new.rate_bp,new.fixed_cents,new.rounding,new.effective_from)
     is distinct from
     (old.channel,old.method,old.kind,old.rate_bp,old.fixed_cents,old.rounding,old.effective_from) then
    raise exception 'PAYMENT_FEE_SCHEDULE_IMMUTABLE';
  end if;
  return new;
end;
$$;
revoke all on function public._payment_fee_schedule_immutable() from public,anon,authenticated,service_role;
create trigger payment_fee_schedules_immutable before update or delete on public.payment_fee_schedules
  for each row execute function public._payment_fee_schedule_immutable();

-- Published rates (public pages; Waffo rates as confirmed by the Owner on 2026-11-21):
--   Stripe https://stripe.com/pricing · Managed Payments 3.5% of the tax-inclusive amount ·
--   Billing 0.7% · Radar $0.05 per screened payment.  Waffo https://docs.waffo.ai/zh/mor/fees ·
--   card 3.9% + $0.50, WeChat Pay and Alipay 3.9%, card refund $1.
-- Which kinds apply to a given payment (MP only on Managed Payments, billing only on Stripe
-- Billing invoices, fx only when Stripe converted the currency…) is decided by the writer (F3).
insert into public.payment_fee_schedules (channel,method,kind,rate_bp,fixed_cents,rounding,effective_from,note) values
  ('stripe','card','acquiring',290,30,'half_up','2026-11-01T00:00:00Z','Stripe card processing'),
  ('stripe','card','intl_card',150,0,'half_up','2026-11-01T00:00:00Z','Stripe international card'),
  ('stripe','card','fx',100,0,'half_up','2026-11-01T00:00:00Z','Stripe currency conversion'),
  ('stripe','card','mp',350,0,'half_up','2026-11-01T00:00:00Z','Stripe Managed Payments, tax-inclusive amount'),
  ('stripe','card','billing',70,0,'half_up','2026-11-01T00:00:00Z','Stripe Billing, subscription invoices'),
  ('stripe','card','radar',0,5,'half_up','2026-11-01T00:00:00Z','Stripe Radar, per screened payment'),
  ('stripe','cn_card','acquiring',290,30,'half_up','2026-11-01T00:00:00Z','Stripe card processing'),
  ('stripe','cn_card','intl_card',150,0,'half_up','2026-11-01T00:00:00Z','Stripe international card'),
  ('stripe','cn_card','fx',100,0,'half_up','2026-11-01T00:00:00Z','Stripe currency conversion'),
  ('stripe','cn_card','billing',70,0,'half_up','2026-11-01T00:00:00Z','Stripe Billing, subscription invoices'),
  ('stripe','cn_card','radar',0,5,'half_up','2026-11-01T00:00:00Z','Stripe Radar, per screened payment'),
  ('stripe','alipay','acquiring',290,30,'half_up','2026-11-01T00:00:00Z','Stripe Alipay processing'),
  ('stripe','alipay','fx',100,0,'half_up','2026-11-01T00:00:00Z','Stripe currency conversion'),
  ('stripe','alipay','radar',0,5,'half_up','2026-11-01T00:00:00Z','Stripe Radar, per screened payment'),
  ('stripe','wechat_pay','acquiring',290,30,'half_up','2026-11-01T00:00:00Z','Stripe WeChat Pay processing'),
  ('stripe','wechat_pay','fx',100,0,'half_up','2026-11-01T00:00:00Z','Stripe currency conversion'),
  ('stripe','wechat_pay','radar',0,5,'half_up','2026-11-01T00:00:00Z','Stripe Radar, per screened payment'),
  ('waffo','card','acquiring',390,50,'ceil','2026-11-01T00:00:00Z','Waffo card, Apple Pay, Google Pay'),
  ('waffo','card','refund_fee',0,100,'ceil','2026-11-01T00:00:00Z','Waffo card refund'),
  ('waffo','alipay','acquiring',390,0,'ceil','2026-11-01T00:00:00Z','Waffo Alipay'),
  ('waffo','wechat_pay','acquiring',390,0,'ceil','2026-11-01T00:00:00Z','Waffo WeChat Pay');
