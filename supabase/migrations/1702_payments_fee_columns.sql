-- F2 (ARCHITECTURE §6.2 联盟返佣 · 订单手续费): the payment's current fee total, kept by
-- payment_fee_record (1703) in the same transaction as its lines, so the commission function
-- (F5) reads one row. NULL on both = a legacy payment: no fee is deducted, the old formula stays.
-- Existing rows keep NULL; nothing here changes them.
alter table public.payments
  add column fee_status text check (fee_status in ('estimated','final')),
  add column fee_cents integer check (fee_cents >= 0);

-- Payments created before record_from never take fee lines (the Owner: only payments made after
-- go-live). NULL = not live yet, so this migration changes nothing on its own; the go-live card
-- sets it by migration.
create table public.payment_fee_settings (
  singleton boolean primary key default true check (singleton),
  record_from timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.payment_fee_settings (singleton) values (true);
alter table public.payment_fee_settings enable row level security;
revoke all on public.payment_fee_settings from public,anon,authenticated,service_role;
grant select on public.payment_fee_settings to service_role;
