create table public.affiliate_commissions (
  id bigint generated always as identity primary key,
  payment_id bigint not null references public.payments(id) on delete cascade,
  affiliate_user_id uuid not null references public.affiliates(user_id) on delete cascade,
  level smallint not null check (level in (1,2)),
  product_id text not null,
  rate_bp integer not null check (rate_bp between 0 and 10000),
  base_usd bigint not null check (base_usd >= 0),
  amount bigint not null check (amount >= 0),
  status text not null check (status in ('pending','on_hold','confirmed','void')),
  confirm_after timestamptz not null,
  confirmed_at timestamptz,
  void_reason text,
  flags text[] not null default '{}',
  released_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(payment_id,level)
);
create index affiliate_commissions_owner_idx on public.affiliate_commissions(affiliate_user_id,created_at desc,id desc);
create index affiliate_commissions_status_idx on public.affiliate_commissions(status,confirm_after);
create index affiliate_commissions_list_idx on public.affiliate_commissions(created_at desc,id desc);

create table public.affiliate_commission_changes (
  id bigint generated always as identity primary key,
  commission_id bigint not null references public.affiliate_commissions(id) on delete cascade,
  at timestamptz not null default now(),
  old_amount bigint,
  new_amount bigint not null,
  old_status text,
  new_status text not null,
  reason text not null
);
create index affiliate_changes_history_idx on public.affiliate_commission_changes(commission_id,at desc,id desc);

create table public.affiliate_recompute_errors (
  id bigint generated always as identity primary key,
  payment_id bigint not null,
  at timestamptz not null default now(),
  error text not null,
  -- Preserve the payment-time recipients and rates when the first computation rolls back.
  snapshot jsonb,
  resolved_at timestamptz
);
create unique index affiliate_errors_open_payment_idx on public.affiliate_recompute_errors(payment_id) where resolved_at is null;
create index affiliate_errors_queue_idx on public.affiliate_recompute_errors(at desc,id desc) where resolved_at is null;
alter table public.affiliate_commissions enable row level security;
alter table public.affiliate_commission_changes enable row level security;
alter table public.affiliate_recompute_errors enable row level security;
revoke all on public.affiliate_commissions,public.affiliate_commission_changes,public.affiliate_recompute_errors from public,anon,authenticated,service_role;
grant select on public.affiliate_commissions,public.affiliate_commission_changes,public.affiliate_recompute_errors to service_role;
revoke all on sequence public.affiliate_commissions_id_seq,public.affiliate_commission_changes_id_seq,
  public.affiliate_recompute_errors_id_seq from public,anon,authenticated,service_role;
