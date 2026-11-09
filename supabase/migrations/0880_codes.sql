-- T94, ARCHITECTURE §6.4. Campaign economics are checked by admin_save_code.
create table public.codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null check (code ~ '^[A-Z0-9]{4,20}$'),
  kind text not null check (kind in ('invite', 'campaign')),
  owner_user_id uuid references public.profiles(id) on delete cascade,
  invitee_credits integer check (invitee_credits between 1 and 1000),
  invitee_pool text check (invitee_pool in ('free', 'paid')),
  discount_percent integer check (discount_percent between 1 and 90),
  discount_products text[],
  discount_duration text check (discount_duration in ('once', 'repeating', 'forever')),
  discount_months integer check (discount_months > 0),
  discount_valid_days integer check (discount_valid_days > 0),
  stripe_coupon_id text,
  starts_at timestamptz,
  expires_at timestamptz,
  max_redemptions integer check (max_redemptions > 0),
  redemption_count integer not null default 0 check (redemption_count >= 0),
  new_users_only boolean not null default false,
  active boolean not null default true,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'invite') = (owner_user_id is not null)),
  check (kind <> 'invite' or (invitee_credits is null and discount_percent is null)),
  check (kind <> 'campaign' or invitee_credits is not null or discount_percent is not null),
  check ((invitee_credits is null) = (invitee_pool is null)),
  check (invitee_pool <> 'paid' or max_redemptions is not null),
  check ((discount_percent is null) = (discount_products is null)),
  check ((discount_percent is null) = (discount_duration is null)),
  check (discount_percent is not null or (discount_valid_days is null and stripe_coupon_id is null)),
  check ((discount_months is not null) = (discount_duration is not distinct from 'repeating')),
  check (discount_products is null or (cardinality(discount_products) > 0 and
    discount_products <@ array['starter_monthly','starter_yearly','pro_monthly','pro_yearly',
                              'max_monthly','max_yearly','pack_s','pack_m','pack_l']::text[])),
  check (expires_at > starts_at)
);

create unique index codes_invite_owner_idx on public.codes(owner_user_id) where kind = 'invite';
create index codes_kind_created_idx on public.codes(kind, created_at desc, id desc);
create index codes_created_idx on public.codes(created_at desc, id desc);

alter table public.codes enable row level security;
revoke all on public.codes from public, anon, authenticated, service_role;
grant select on public.codes to service_role;
