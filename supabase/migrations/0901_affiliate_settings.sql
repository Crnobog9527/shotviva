create table public.affiliate_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  hold_days integer not null default 30 check (hold_days >= 0),
  payout_min_usd bigint not null default 20000 check (payout_min_usd > 0),
  settlement_day integer not null default 1 check (settlement_day between 1 and 28),
  apply_min_level text not null default 'none' check (apply_min_level in ('none','any_paid','starter','pro','max')),
  terms_version text not null default '1' check (length(trim(terms_version)) > 0)
);
insert into public.affiliate_settings default values;

create table public.affiliate_rates (
  product_kind text primary key check (product_kind in ('pack','monthly','yearly')),
  l1_bp integer not null check (l1_bp between 0 and 10000),
  l2_bp integer not null check (l2_bp between 0 and 10000)
);
insert into public.affiliate_rates values ('pack',1500,500),('monthly',1500,500),('yearly',1000,300);

create table public.affiliate_rate_overrides (
  user_id uuid not null references public.affiliates(user_id) on delete cascade,
  product_kind text not null references public.affiliate_rates(product_kind),
  l1_bp integer check (l1_bp between 0 and 10000),
  l2_bp integer check (l2_bp between 0 and 10000),
  primary key(user_id,product_kind)
);

alter table public.affiliate_settings enable row level security;
alter table public.affiliate_rates enable row level security;
alter table public.affiliate_rate_overrides enable row level security;
revoke all on public.affiliate_settings,public.affiliate_rates,public.affiliate_rate_overrides from public,anon,authenticated,service_role;
grant select on public.affiliate_settings,public.affiliate_rates,public.affiliate_rate_overrides to service_role;
