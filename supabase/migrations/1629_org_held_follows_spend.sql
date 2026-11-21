-- The org's share of a member's paid credits follows what they spend (ARCHITECTURE §6.5). The
-- member's own credits count as spent first, so the org share only shrinks once the balance falls
-- below it. Every paid-pool movement goes through _apply_credit_change, which writes one
-- credit_ledger row with the balance after it; a trigger on that row keeps held_credits right:
--  - a debit (a reserve, a clawback, an admin adjustment) that takes the balance below
--    held_credits lowers it to the balance, and records how much of the org share this debit
--    took, keyed by the debit's idempotency key;
--  - a refund gives that share back: refund keys are the reserve key with its last part changed
--    (`job:<id>:refund`, `job:<id>:poster_free_redraw`, `poster_photo:<id>:refund` for
--    `job:<id>:reserve` / `poster_photo:<id>:reserve`), and the refunded amount is added back to
--    held_credits up to what that reserve took and not yet given back, while the member is still
--    in the same org. A failed job therefore leaves the split exactly as before it started, and
--    repeating failed jobs cannot move org credits to the member.
-- Credits the member buys later are never counted as the org's (reclaim, monthly top-up, owner
-- deposit, refund clawback). org_allocate / org_reclaim / org_deposit are the org functions' own
-- movements and set held_credits themselves. The trigger runs while _apply_credit_change holds the
-- profile row and then locks the member row, the order every org function uses too (1627).

create table public.org_held_draws (
  debit_key text primary key,
  org_id uuid not null references public.orgs(id),
  user_id uuid not null references public.profiles(id) on delete cascade,
  drawn integer not null check (drawn > 0),
  restored integer not null default 0 check (restored between 0 and drawn),
  created_at timestamptz not null default now()
);
alter table public.org_held_draws enable row level security;
revoke all on public.org_held_draws from public, anon, authenticated, service_role;
grant select on public.org_held_draws to service_role;

create or replace function public._org_held_follows_ledger() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  m public.org_members;
  d public.org_held_draws;
  back integer;
begin
  if new.delta < 0 then
    select * into m from public.org_members where user_id = new.user_id and status = 'active' for update;
    if found and m.held_credits > new.balance_after then
      update public.org_members set held_credits = new.balance_after where org_id = m.org_id and user_id = m.user_id;
      insert into public.org_held_draws(debit_key, org_id, user_id, drawn)
        values (new.idempotency_key, m.org_id, m.user_id, m.held_credits - new.balance_after);
    end if;
  elsif new.kind = 'refund' then
    select * into d from public.org_held_draws
     where debit_key = regexp_replace(new.idempotency_key, ':[^:]+$', ':reserve') and user_id = new.user_id for update;
    if not found or d.restored >= d.drawn then return new; end if;
    select * into m from public.org_members where org_id = d.org_id and user_id = d.user_id and status = 'active' for update;
    if not found then return new; end if;
    back := least(new.delta, d.drawn - d.restored);
    update public.org_members set held_credits = least(held_credits + back, new.balance_after)
     where org_id = m.org_id and user_id = m.user_id;
    update public.org_held_draws set restored = restored + back where debit_key = d.debit_key;
  end if;
  return new;
end;
$$;
revoke all on function public._org_held_follows_ledger() from public, anon, authenticated, service_role;

create trigger credit_ledger_org_held
  after insert on public.credit_ledger
  for each row when (new.pool = 'paid' and new.kind not in ('org_allocate', 'org_reclaim', 'org_deposit'))
  execute function public._org_held_follows_ledger();
