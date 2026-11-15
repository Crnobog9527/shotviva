-- Admin writes of the vessel library (1556), service role only, each checking that p_actor is an
-- admin like admin_save_template_category (0582). Messages the admin code turns into Chinese:
--   NOT_ADMIN           p_actor is not an admin
--   INVALID_INPUT       a missing or malformed field (the table's checks say which)
--   DISHWARE_NOT_FOUND  no vessel with that id

-- Create or edit one vessel by its id (the caller makes the id, so an import can repeat itself).
-- Returns the image key the row had before (null for a new one), so the caller can delete an
-- object a new image replaced.
create function public.admin_save_dishware(p_item jsonb, p_actor uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
  v_previous text;
begin
  if p_actor is null or not exists (select 1 from public.profiles p where p.id = p_actor and p.role = 'admin') then
    raise exception 'NOT_ADMIN';
  end if;
  begin
    v_id := (p_item ->> 'id')::uuid;
  exception when invalid_text_representation then
    raise exception 'INVALID_INPUT' using detail = 'id';
  end;
  if v_id is null or jsonb_typeof(p_item -> 'is_active') <> 'boolean' then
    raise exception 'INVALID_INPUT' using detail = 'id and is_active are required';
  end if;
  select d.image_key into v_previous from public.dishware_library d where d.id = v_id for update;
  insert into public.dishware_library as d (id, label, category, shape, image_key, width, height, is_active, updated_by)
  values (
    v_id, btrim(p_item ->> 'label'), p_item ->> 'category', btrim(p_item ->> 'shape'), p_item ->> 'image_key',
    (p_item ->> 'width')::integer, (p_item ->> 'height')::integer, (p_item ->> 'is_active')::boolean, p_actor
  )
  on conflict (id) do update set
    label = excluded.label, category = excluded.category, shape = excluded.shape, image_key = excluded.image_key,
    width = excluded.width, height = excluded.height, is_active = excluded.is_active, updated_by = p_actor;
  return jsonb_build_object('previous_key', v_previous);
exception
  when check_violation or not_null_violation or unique_violation or invalid_text_representation then
    raise exception 'INVALID_INPUT' using detail = sqlerrm;
end;
$$;

-- Removes one vessel and returns its image key for the caller to delete.
create function public.admin_delete_dishware(p_id uuid, p_actor uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_key text;
begin
  if p_actor is null or not exists (select 1 from public.profiles p where p.id = p_actor and p.role = 'admin') then
    raise exception 'NOT_ADMIN';
  end if;
  delete from public.dishware_library d where d.id = p_id returning d.image_key into v_key;
  if v_key is null then
    raise exception 'DISHWARE_NOT_FOUND';
  end if;
  return v_key;
end;
$$;

revoke all on function public.admin_save_dishware(jsonb, uuid) from public, anon, authenticated;
revoke all on function public.admin_delete_dishware(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_save_dishware(jsonb, uuid) to service_role;
grant execute on function public.admin_delete_dishware(uuid, uuid) to service_role;
