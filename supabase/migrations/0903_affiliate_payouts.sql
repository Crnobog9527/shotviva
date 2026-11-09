create table public.affiliate_adjustments (
  id bigint generated always as identity primary key,
  request_id uuid not null unique,
  affiliate_user_id uuid not null references public.affiliates(user_id) on delete cascade,
  amount bigint not null check (amount <> 0),
  reason text not null check (length(trim(reason)) > 0),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index affiliate_adjustments_owner_idx on public.affiliate_adjustments(affiliate_user_id,created_at desc,id desc);
create table public.affiliate_payouts (
  id bigint generated always as identity primary key,
  affiliate_user_id uuid not null references public.affiliates(user_id) on delete cascade,
  period date not null,
  amount bigint not null check (amount > 0),
  status text not null default 'due' check (status in ('due','paid','held')),
  payout_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  paid_method text,
  paid_reference text,
  decided_by uuid references public.profiles(id) on delete set null,
  note text,
  unique(affiliate_user_id,period)
);
create index affiliate_payouts_owner_idx on public.affiliate_payouts(affiliate_user_id,created_at desc,id desc);
create index affiliate_payouts_period_idx on public.affiliate_payouts(period,created_at desc,id desc);
create index affiliate_payouts_list_idx on public.affiliate_payouts(created_at desc,id desc);
create table public.affiliate_click_days (
  affiliate_user_id uuid not null references public.affiliates(user_id) on delete cascade,
  day date not null,
  clicks bigint not null default 0 check (clicks >= 0),
  primary key(affiliate_user_id,day)
);
alter table public.affiliate_adjustments enable row level security;
alter table public.affiliate_payouts enable row level security;
alter table public.affiliate_click_days enable row level security;
revoke all on public.affiliate_adjustments,public.affiliate_payouts,public.affiliate_click_days from public,anon,authenticated,service_role;
grant select on public.affiliate_adjustments,public.affiliate_payouts,public.affiliate_click_days to service_role;

create view public.affiliate_balances with (security_invoker = true) as
select a.user_id affiliate_user_id,coalesce(c.confirmed,0)::bigint confirmed,
       coalesce(c.pending,0)::bigint pending,coalesce(p.paid,0)::bigint paid,
       (coalesce(c.confirmed,0)+coalesce(j.adjusted,0)-coalesce(p.reserved,0))::bigint available
  from public.affiliates a
  left join lateral (select sum(amount) filter (where status='confirmed') confirmed,
                            sum(amount) filter (where status='pending') pending
                       from public.affiliate_commissions where affiliate_user_id=a.user_id) c on true
  left join lateral (select sum(amount) adjusted from public.affiliate_adjustments where affiliate_user_id=a.user_id) j on true
  left join lateral (select sum(amount) filter (where status='paid') paid,
                            sum(amount) filter (where status in ('paid','due')) reserved
                       from public.affiliate_payouts where affiliate_user_id=a.user_id) p on true;
revoke all on public.affiliate_balances from public,anon,authenticated,service_role;
grant select on public.affiliate_balances to service_role;
revoke all on sequence public.affiliate_adjustments_id_seq,public.affiliate_payouts_id_seq from public,anon,authenticated,service_role;
