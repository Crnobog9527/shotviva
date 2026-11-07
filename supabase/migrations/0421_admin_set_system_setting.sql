-- T62: the admin save for a system setting (ARCHITECTURE §15.6). One upsert per save; the
-- admin's id goes into updated_by, like admin_set_feature_access (0241). Only an admin may
-- save, and only a registered key with a value of the right type is accepted:
--   wishlist_enabled  boolean  whether the template wishlist is open (default off)

create function public.admin_set_system_setting(p_key text, p_value jsonb, p_actor uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_actor is null then
    raise exception 'INVALID_INPUT' using detail = 'actor is required';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_actor and p.role = 'admin') then
    raise exception 'NOT_ADMIN';
  end if;

  case p_key
    when 'wishlist_enabled' then
      if p_value is null or jsonb_typeof(p_value) <> 'boolean' then
        raise exception 'INVALID_INPUT' using detail = 'wishlist_enabled must be a boolean';
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
end;
$$;

revoke execute on function public.admin_set_system_setting(text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.admin_set_system_setting(text, jsonb, uuid) to service_role;
