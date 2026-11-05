-- Ban from the SQL editor (ARCHITECTURE §10). profiles has no reason column (T1 owns it),
-- so the reason goes to a private audit log. A banned user cannot reserve credits.
create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  action text not null check (action in ('ban_user')),
  user_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (length(reason) > 0),
  created_at timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;

revoke all on public.admin_audit_log from anon, authenticated;
-- Server-side reads only (support, debugging); writes go through SQL functions.
grant select on public.admin_audit_log to service_role;

create function public.admin_ban_user(p_user_id uuid, p_reason text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_banned_at timestamptz;
begin
  if p_reason is null or length(p_reason) = 0 then
    raise exception 'INVALID_INPUT' using detail = 'reason is required';
  end if;

  -- Keep the first ban time when banning twice.
  update public.profiles
     set banned_at = coalesce(banned_at, now())
   where id = p_user_id
  returning banned_at into v_banned_at;
  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  insert into public.admin_audit_log (action, user_id, reason) values ('ban_user', p_user_id, p_reason);
  return v_banned_at;
end;
$$;

revoke execute on function public.admin_ban_user(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_ban_user(uuid, text) to service_role;
