-- T108 (ARCHITECTURE §9 第 1、5 条): two runtime switches for the public gallery, both off until
-- an admin saves them. Same body as before otherwise; the gallery keys also leave an audit row
-- (the action is in 1200) because opening the gallery publishes users' works. Security definer
-- now, like the other audited admin functions: the audit log refuses direct writes from every
-- role. Execute stays revoked from public, anon and authenticated (0421); only service_role.
create or replace function public.admin_set_system_setting(p_key text, p_value jsonb, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_actor is null then
    raise exception 'INVALID_INPUT' using detail = 'actor is required';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_actor and p.role = 'admin'
      and (p_key not in ('code_gift_policy','code_inviter_window_days','gallery_enabled','gallery_auto_approve')
           or p.banned_at is null)) then
    raise exception 'NOT_ADMIN';
  end if;

  case p_key
    when 'wishlist_enabled', 'gallery_enabled', 'gallery_auto_approve' then
      if p_value is null or jsonb_typeof(p_value) <> 'boolean' then
        raise exception 'INVALID_INPUT' using detail = p_key || ' must be a boolean';
      end if;
    when 'admin_test_daily_budget_usd' then
      if p_value is null or jsonb_typeof(p_value) <> 'number'
         or (p_value #>> '{}')::numeric < 0 or (p_value #>> '{}')::numeric > 1000 then
        raise exception 'INVALID_INPUT' using detail = 'admin_test_daily_budget_usd must be a number from 0 to 1000';
      end if;
    when 'code_inviter_window_days' then
      if jsonb_typeof(p_value) is distinct from 'number' or
         (p_value #>> '{}') !~ '^[1-9][0-9]*$' or (p_value #>> '{}')::numeric > 2147483647 then
        raise exception 'INVALID_INPUT' using detail = 'reward window must be a positive integer';
      end if;
    when 'code_gift_policy' then
      if jsonb_typeof(p_value) is distinct from 'object' or
         jsonb_typeof(p_value->'requirePaidGiftCap') is distinct from 'boolean' or
         jsonb_typeof(p_value->'maxCreditsPerCode') is distinct from 'number' or
         (p_value->>'maxCreditsPerCode') !~ '^[1-9][0-9]*$' or
         (p_value->>'maxCreditsPerCode')::numeric > 2147483647 or
         p_value - array['requirePaidGiftCap','maxCreditsPerCode'] <> '{}'::jsonb then
        raise exception 'INVALID_INPUT' using detail = 'invalid gift code policy';
      end if;
    else
      raise exception 'INVALID_INPUT' using detail = 'unknown setting';
  end case;

  insert into public.system_settings (key, value, updated_at, updated_by)
  values (p_key, p_value, now(), p_actor)
  on conflict (key) do update
    set value = excluded.value,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;

  if p_key in ('gallery_enabled', 'gallery_auto_approve') then
    insert into public.admin_audit_log (action, user_id, reason, target_id)
    values ('gallery_setting', p_actor, p_value::text, p_key);
  end if;
end;
$$;

revoke execute on function public.admin_set_system_setting(text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.admin_set_system_setting(text, jsonb, uuid) to service_role;
