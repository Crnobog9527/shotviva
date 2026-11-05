-- Baseline (T15): accounts. One profile row per auth user, created by trigger.
--   profiles.credits       paid credits (purchases, admin compensation); make paid works
--   profiles.free_credits  signup / promo gifts; only make free works
--   profiles.paid_until    membership period, display only; decides no entitlement
-- Column order is part of the row type that functions return, so free_credits stays last.
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  role text not null default 'user' check (role in ('user', 'admin')),
  credits integer not null default 0 check (credits >= 0),
  paid_until timestamptz,
  signup_ip inet,
  banned_at timestamptz,
  created_at timestamptz not null default now(),
  free_credits integer not null default 0 check (free_credits >= 0)
);

alter table public.profiles enable row level security;

-- Clients may read their own row; every write goes through security-definer SQL functions.
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

revoke insert, update, delete, truncate on public.profiles from anon, authenticated;

-- Current Supabase projects no longer grant table privileges to the API roles by default,
-- so each one is spelled out. Signed-in users read (RLS limits it to their own row); the
-- service role may only fill signup_ip (ARCHITECTURE §7). Credits, role and paid_until change
-- solely through security-definer functions, which run as the table owner.
grant select on public.profiles to authenticated, service_role;
grant update (signup_ip) on public.profiles to service_role;

-- The signup bonus is granted by the app (core/auth/free-credits.ts) through grant_credits,
-- so the trigger only creates the empty row.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
-- THROWAWAY: proves the append-only guard fails this PR; reverted in the next commit.
