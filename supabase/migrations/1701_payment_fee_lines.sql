-- F2 (ARCHITECTURE §6.2 联盟返佣 · 订单手续费): each payment's processing fees, one row per fee
-- item, in USD cents. Append-only: a write is a set of lines for one scope (the charge itself,
-- or one refund) and gets the next revision number of that scope; the latest revision of each
-- scope is what counts, earlier ones stay as the record of what was estimated before. Only the
-- functions in 1703 write it.
create table public.payment_fee_lines (
  id bigint generated always as identity primary key,
  payment_id bigint not null references public.payments(id) on delete cascade,
  -- NULL: the charge's own fees. Otherwise the provider's refund id (Stripe re_…, Waffo REF_…)
  -- and the line is that refund's fee.
  refund_id text check (refund_id is null or length(refund_id) between 1 and 200),
  revision integer not null check (revision >= 1),
  line_no smallint not null check (line_no between 1 and 20),
  kind text not null check (kind in ('acquiring','intl_card','fx','mp','billing','radar','refund_fee','other')),
  channel text not null check (channel in ('stripe','waffo')),
  -- The published rate this line was priced or labelled with; NULL only for 'other'-style lines
  -- that have no published rate.
  schedule_id bigint references public.payment_fee_schedules(id),
  rate_bp integer check (rate_bp between 0 and 10000),
  fixed_cents integer check (fixed_cents >= 0),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'usd' check (currency = 'usd'),
  -- estimate: published rate, until the provider's real figure is read; stripe_bt: Stripe's
  -- balance_transaction stripe_fee rows; waffo_settlement: Waffo settlementInfo.feeAmount;
  -- formula: no per-payment figure exists (Managed Payments, Billing, Radar), published rate.
  source text not null check (source in ('estimate','stripe_bt','waffo_settlement','formula')),
  status text not null check (status in ('estimated','final')),
  source_ref text check (source_ref is null or length(source_ref) between 1 and 200),
  -- Shared by every line one write produced; a replayed write finds it and adds nothing.
  idempotency_key text not null check (length(idempotency_key) between 1 and 200),
  note text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now(),
  constraint payment_fee_lines_key unique (idempotency_key, line_no),
  constraint payment_fee_lines_scope check ((refund_id is null) = (kind <> 'refund_fee')),
  constraint payment_fee_lines_rate check (
    (schedule_id is null and rate_bp is null and fixed_cents is null)
    or (schedule_id is not null and rate_bp is not null and fixed_cents is not null)),
  constraint payment_fee_lines_status check (
    (source = 'estimate' and status = 'estimated')
    or (source in ('stripe_bt','waffo_settlement') and status = 'final')
    or source = 'formula'),
  constraint payment_fee_lines_source_channel check (
    (source <> 'stripe_bt' or channel = 'stripe') and (source <> 'waffo_settlement' or channel = 'waffo'))
);
-- One revision per scope (also the payment lookup and the profiles → payments cascade).
create unique index payment_fee_lines_revision_key
  on public.payment_fee_lines (payment_id, coalesce(refund_id,''), revision, line_no);
create index payment_fee_lines_schedule_idx on public.payment_fee_lines (schedule_id) where schedule_id is not null;

alter table public.payment_fee_lines enable row level security;
revoke all on public.payment_fee_lines from public,anon,authenticated,service_role;
grant select on public.payment_fee_lines to service_role;
revoke all on sequence public.payment_fee_lines_id_seq from public,anon,authenticated,service_role;

-- Never rewritten: a correction is a new revision. Deletes only come from the payments cascade
-- (account deletion), so they are not blocked here; no role is granted delete.
create function public._payment_fee_lines_append_only() returns trigger
language plpgsql set search_path='' as $$
begin
  raise exception 'PAYMENT_FEE_LINES_APPEND_ONLY';
end;
$$;
revoke all on function public._payment_fee_lines_append_only() from public,anon,authenticated,service_role;
create trigger payment_fee_lines_append_only before update on public.payment_fee_lines
  for each row execute function public._payment_fee_lines_append_only();
