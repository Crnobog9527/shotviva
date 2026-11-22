-- Account deletion (1971), control 2026-11-23: no creator id outlives the account, also when the
-- account is removed without the archive step (e.g. from the Auth dashboard). archive_org_works
-- already nulls org_work_deletions.maker_user_id on the normal path; this trigger does it once per
-- deleted profile (profiles is deleted by the cascade from auth.users) whatever the path.
-- Expand-only: a partial index and a BEFORE DELETE trigger that only clears that column.

create index org_work_deletions_maker_idx on public.org_work_deletions (maker_user_id)
  where maker_user_id is not null;

create function public._org_work_forget_maker() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.org_work_deletions set maker_user_id = null where maker_user_id = old.id;
  return old;
end $$;

create trigger profiles_org_work_forget_maker
before delete on public.profiles
for each row execute function public._org_work_forget_maker();

revoke all on function public._org_work_forget_maker() from public, anon, authenticated, service_role;
