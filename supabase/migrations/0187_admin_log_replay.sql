-- T26: the audit row for an admin Stripe replay (ARCHITECTURE §10, spec #90). The replay itself
-- runs through settle_checkout / sync_subscription, which are idempotent on their own; this is
-- the second call, the documented AGENTS §5.1 exception for admin replay only. It can only write
-- replay_checkout, with the cs_… / sub_… id as target_id.

create function public.admin_log_replay(p_user_id uuid, p_target_id text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or p_target_id is null or p_target_id !~ '^(cs|sub)_'
     or p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'INVALID_INPUT' using detail = 'user, a cs_/sub_ target and a reason are required';
  end if;

  insert into public.admin_audit_log (action, user_id, target_id, reason)
  values ('replay_checkout', p_user_id, p_target_id, p_reason);
end;
$$;

revoke execute on function public.admin_log_replay(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_log_replay(uuid, text, text) to service_role;
