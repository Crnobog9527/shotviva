-- Payout fee rules (ARCHITECTURE §6.2 联盟返佣 · 打款扣费). Admin-defined deductions taken from
-- the affiliate's payout: percent of the payout, a fixed USD fee, or both. A statement copies the
-- rules that apply to it when it is issued, so later edits never change an issued statement.
-- `program` lets a future program (e.g. an enterprise edition) keep its own rule set.
create table public.affiliate_payout_fee_rules (
  id bigint generated always as identity primary key,
  program text not null default 'standard' check (program ~ '^[a-z][a-z0-9_]{0,39}$'),
  label_zh text not null check (length(trim(label_zh)) between 1 and 80),
  label_en text not null check (length(trim(label_en)) between 1 and 80),
  kind text not null check (kind in ('percent','fixed','percent_fixed')),
  percent_bp integer not null default 0 check (percent_bp between 0 and 10000),
  fixed_cents bigint not null default 0 check (fixed_cents between 0 and 10000000),
  min_cents bigint check (min_cents between 0 and 10000000),
  max_cents bigint check (max_cents between 0 and 10000000),
  payout_methods text[] check (payout_methods is null or (cardinality(payout_methods) > 0
    and payout_methods <@ array['paypal','wise','bank','alipay','other']::text[])),
  active boolean not null default true,
  effective_from timestamptz not null default now(),
  sort_order integer not null default 0 check (sort_order between 0 and 1000),
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id),
  constraint affiliate_payout_fee_rules_shape check (
    (kind = 'percent' and percent_bp > 0 and fixed_cents = 0)
    or (kind = 'fixed' and percent_bp = 0 and fixed_cents > 0)
    or (kind = 'percent_fixed' and percent_bp > 0 and fixed_cents > 0)),
  constraint affiliate_payout_fee_rules_bounds check (min_cents is null or max_cents is null or min_cents <= max_cents)
);
alter table public.affiliate_payout_fee_rules enable row level security;
revoke all on public.affiliate_payout_fee_rules from public,anon,authenticated,service_role;
grant select on public.affiliate_payout_fee_rules to service_role;
revoke all on sequence public.affiliate_payout_fee_rules_id_seq from public,anon,authenticated,service_role;

-- fee_rules: NULL for statements issued before fee rules existed (they never carry fees); otherwise
-- the issued copy, possibly an empty array. fee_amount / fee_lines are written once, when paid.
-- paid_amount keeps meaning the gross amount taken from the balance; the net sent is
-- paid_amount - fee_amount.
alter table public.affiliate_payouts
  add column fee_rules jsonb check (fee_rules is null or jsonb_typeof(fee_rules) = 'array'),
  add column fee_amount bigint check (fee_amount >= 0),
  add column fee_lines jsonb check (fee_lines is null or jsonb_typeof(fee_lines) = 'array');
