-- The org's share of a member's paid credits never exceeds what is left (ARCHITECTURE §6.5). The
-- member's own credits count as spent first, so the org share only shrinks once the balance falls
-- below it: whenever a member's paid balance goes down (a generation, a clawback, an admin
-- adjustment, an org reclaim or deposit), held_credits is lowered to the new balance if it was
-- above it. Credits the member buys later are therefore never counted as the org's (reclaim,
-- monthly top-up, owner deposit, refund clawback). It runs while the profile row is locked and then locks
-- the member row, the order every org function uses too (1627).
create or replace function public._org_held_follows_spend() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.org_members set held_credits = new.credits
   where user_id = new.id and status = 'active' and held_credits > new.credits;
  return new;
end;
$$;
revoke all on function public._org_held_follows_spend() from public, anon, authenticated, service_role;

create trigger profiles_org_held_follows_spend
  after update of credits on public.profiles
  for each row when (new.credits < old.credits)
  execute function public._org_held_follows_spend();
