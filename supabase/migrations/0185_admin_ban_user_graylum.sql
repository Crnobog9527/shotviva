-- T25: banning also disconnects Graylum, in the same transaction (ARCHITECTURE §7「封禁的范围」,
-- Owner 2026-11-06). The link is revoked exactly like the account page's "Disconnect"
-- (core/partner/link-code.ts revokeLink): revoked_at set, any pending link code dropped so it
-- cannot re-link. Unbanning does not reconnect; the user connects again from Graylum.
-- partner_links primary key (user_id, partner). Signature unchanged.

create or replace function public.admin_ban_user(p_user_id uuid, p_reason text)
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

  update public.partner_links
     set revoked_at = now(), link_code = null, code_expires_at = null
   where user_id = p_user_id
     and revoked_at is null;

  insert into public.admin_audit_log (action, user_id, reason) values ('ban_user', p_user_id, p_reason);
  return v_banned_at;
end;
$$;
