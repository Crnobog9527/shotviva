-- 2009: the food templates' 优化摆盘 and 优化器皿 get a site-wide switch each (ARCHITECTURE §5.1c,
-- §15.6; Owner 2026-11-27: 优化器皿 back on for matching tableware, 优化摆盘 stays off).
-- system_settings keys food_plating_enabled (fields.toggles plating) and food_tableware_enabled
-- (fields.toggles tableware), boolean; no row means off. The new code offers a toggle only while its
-- own switch is on and renders it off otherwise; the dish-name copy field is offered while either
-- is on (both flows read the dish).
--
-- Expand-only: food_toggles_enabled (1848) stays as it is and is still saved by
-- admin_set_system_setting, so the code deployed before this release keeps reading it unchanged.
-- Both new keys start from its current value (a missing row stays missing: off), so nothing
-- changes at release. Saved through a function of their own rather than another body of
-- admin_set_system_setting, so this migration and any other that replaces that function cannot
-- drop each other's keys.

insert into public.system_settings (key, value, updated_at, updated_by)
select k.key, s.value, now(), s.updated_by
  from public.system_settings s
  cross join (values ('food_plating_enabled'), ('food_tableware_enabled')) as k(key)
 where s.key = 'food_toggles_enabled' and jsonb_typeof(s.value) = 'boolean'
on conflict (key) do nothing;

-- The same checks admin_set_system_setting makes for a boolean switch: an unbanned admin, one of
-- these two keys, a JSON boolean.
create or replace function public.admin_set_food_switch(p_key text, p_value jsonb, p_actor uuid) returns void
    language plpgsql security definer
    set search_path to ''
    as $$
begin
  if p_actor is null then
    raise exception 'INVALID_INPUT' using detail = 'actor is required';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_actor and p.role = 'admin' and p.banned_at is null) then
    raise exception 'NOT_ADMIN';
  end if;
  if p_key is null or p_key not in ('food_plating_enabled', 'food_tableware_enabled') then
    raise exception 'INVALID_INPUT' using detail = 'unknown setting';
  end if;
  if p_value is null or jsonb_typeof(p_value) <> 'boolean' then
    raise exception 'INVALID_INPUT' using detail = p_key || ' must be a boolean';
  end if;

  insert into public.system_settings (key, value, updated_at, updated_by)
  values (p_key, p_value, now(), p_actor)
  on conflict (key) do update
    set value = excluded.value,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.admin_set_food_switch(text, jsonb, uuid) from public, anon, authenticated, service_role;
grant execute on function public.admin_set_food_switch(text, jsonb, uuid) to service_role;
