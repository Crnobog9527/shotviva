-- T94. One row is the audit trail of a claim, its gift, discount and first-purchase reward.
create table public.code_redemptions (
  id uuid primary key default gen_random_uuid(),
  code_id uuid references public.codes(id) on delete set null,
  kind text not null check (kind in ('invite','campaign')),
  user_id uuid not null references public.profiles(id) on delete cascade,
  inviter_user_id uuid references public.profiles(id) on delete set null,
  context text not null check (context in ('signup','account','paywall')),
  status text not null check (status in ('ok','blocked_same_ip','blocked_no_signup_grant')),
  credits_granted integer not null default 0 check (credits_granted >= 0),
  inviter_rewarded_at timestamptz,
  inviter_reward_payment_id bigint references public.payments(id) on delete set null,
  discount_expires_at timestamptz,
  discount_used_payment_id bigint references public.payments(id) on delete set null,
  discount_void_at timestamptz,
  checkout_prepared boolean not null default false,
  checkout_token uuid,
  checkout_expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (code_id,user_id),
  check ((checkout_token is null) = (checkout_expires_at is null))
);

create unique index code_redemptions_invite_user_idx on public.code_redemptions(user_id) where kind = 'invite';
create index code_redemptions_code_created_idx on public.code_redemptions(code_id, created_at desc, id desc);
create index code_redemptions_inviter_created_idx on public.code_redemptions(inviter_user_id, created_at desc)
  where inviter_user_id is not null;
create index code_redemptions_pending_idx on public.code_redemptions(user_id)
  where discount_used_payment_id is null and discount_void_at is null;
create index code_redemptions_same_ip_idx on public.code_redemptions(created_at desc, id desc)
  where status = 'blocked_same_ip';

alter table public.code_redemptions enable row level security;
revoke all on public.code_redemptions from public, anon, authenticated, service_role;
grant select on public.code_redemptions to service_role;
