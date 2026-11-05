-- T14: two credit pools, paid-ness decided per work (ARCHITECTURE §6.1, §6.2, §4).
--   profiles.free_credits  signup / promo gifts; only make free works
--   profiles.credits       paid credits (purchases, admin compensation); make paid works
--   profiles.paid_until    membership period, display only; decides no entitlement
-- Schema and backfill only; the functions are rewritten in 0141 and 0142.

alter table public.profiles
  add column free_credits integer not null default 0 check (free_credits >= 0);

-- Which pool a ledger row moved. balance_after is that pool's balance after the change.
alter table public.credit_ledger
  add column pool text not null default 'paid' check (pool in ('free', 'paid'));
alter table public.credit_ledger alter column pool drop default;

-- Which pool paid for the work. It alone decides watermark, default visibility and
-- commercial use; a free work is always public.
alter table public.generation_jobs
  add column credit_pool text check (credit_pool in ('free', 'paid'));

-- Pack-style products add paid credits without touching paid_until (ARCHITECTURE §6.2).
alter table public.products alter column days drop not null;
update public.products set days = null where id = 'pack';

-- Backfill for databases that ran the single-pool functions (preview only; nothing is live).
-- The unspent part of the signup bonus moves to the free pool; everything else stays paid.
with signup as (
  select l.user_id, l.delta
    from public.credit_ledger l
   where l.kind = 'grant' and l.idempotency_key = 'signup:' || l.user_id::text
)
update public.profiles p
   set free_credits = least(p.credits, s.delta),
       credits = p.credits - least(p.credits, s.delta)
  from signup s
 where s.user_id = p.id;

update public.credit_ledger
   set pool = 'free'
 where kind = 'grant' and idempotency_key = 'signup:' || user_id::text;

-- Old rule: unpaid owners' works were forced public, paid owners defaulted to private.
-- Public works are treated as free works (watermarked), private ones as paid.
update public.generation_jobs
   set credit_pool = case when visibility = 'private' then 'paid' else 'free' end;

alter table public.generation_jobs alter column credit_pool set not null;

alter table public.generation_jobs
  add constraint generation_jobs_free_work_public check (credit_pool = 'paid' or visibility = 'public');
