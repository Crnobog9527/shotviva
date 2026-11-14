-- T23: switch an announcement on or off (ARCHITECTURE §10). Switching on is a switch, not a
-- failure: active announcements whose window overlaps this one are switched off in the same
-- transaction, and their ids are returned so the admin can say which ones stopped.

create function public.admin_activate_announcement(p_id uuid, p_active boolean, p_actor uuid)
returns uuid[]
language plpgsql
set search_path = ''
as $$
declare
  v_row public.site_announcements;
  v_window tstzrange;
  v_stopped uuid[];
begin
  if p_active is null then
    raise exception 'INVALID_INPUT' using detail = 'active is required';
  end if;

  -- Serialises two switches: each would otherwise scan for overlaps before the other commits.
  -- Plain reads (the banner) are not blocked.
  lock table public.site_announcements in share row exclusive mode;

  select * into v_row from public.site_announcements where id = p_id;
  if not found then
    raise exception 'ANNOUNCEMENT_NOT_FOUND';
  end if;

  if not p_active then
    update public.site_announcements set is_active = false, updated_by = p_actor where id = p_id and is_active;
    return '{}'::uuid[];
  end if;

  v_window := tstzrange(coalesce(v_row.starts_at, '-infinity'::timestamptz), coalesce(v_row.ends_at, 'infinity'::timestamptz));

  with stopped as (
    update public.site_announcements a
       set is_active = false, updated_by = p_actor
     where a.is_active
       and a.id <> p_id
       and tstzrange(coalesce(a.starts_at, '-infinity'::timestamptz), coalesce(a.ends_at, 'infinity'::timestamptz)) && v_window
    returning a.id
  )
  select coalesce(array_agg(id order by id), '{}'::uuid[]) into v_stopped from stopped;

  update public.site_announcements set is_active = true, updated_by = p_actor where id = p_id and not is_active;
  return v_stopped;
end;
$$;

revoke execute on function public.admin_activate_announcement(uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public.admin_activate_announcement(uuid, boolean, uuid) to service_role;
