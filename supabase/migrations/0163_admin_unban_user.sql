-- T23: lift a ban (ARCHITECTURE §10). Like admin_ban_user, the reason goes to the private
-- audit log, so the log now allows 'unban_user'.

alter table public.admin_audit_log
  drop constraint admin_audit_log_action_check,
  add constraint admin_audit_log_action_check check (action in ('ban_user', 'unban_user'));

create function public.admin_unban_user(p_user_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'INVALID_INPUT' using detail = 'reason is required';
  end if;

  update public.profiles set banned_at = null where id = p_user_id;
  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  insert into public.admin_audit_log (action, user_id, reason) values ('unban_user', p_user_id, p_reason);
end;
$$;

revoke execute on function public.admin_unban_user(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_unban_user(uuid, text) to service_role;
