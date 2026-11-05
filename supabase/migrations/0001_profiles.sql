-- Owned by T1 (auth & account). T2 carries this copy until T1 merges; whichever
-- lands second rebases and keeps a single 0001_profiles.sql.
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  role text not null default 'user' check (role in ('user', 'admin')),
  credits integer not null default 0 check (credits >= 0),
  paid_until timestamptz,
  signup_ip inet,
  banned_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Clients may read their own row; every write goes through security-definer SQL functions.
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

-- Grants are explicit: newer Supabase stacks no longer grant table access by default.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated, service_role;

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
