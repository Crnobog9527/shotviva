-- T87: the admin's own uploads and removals of one language's cover (ARCHITECTURE §8.3: each
-- language tab uploads, replaces and deletes on its own). One call merges p_patch into
-- templates.cover_locales -> p_locale:
--   keys     before, after, video, poster (https URLs) and media ('animated' | 'video');
--   a null   removes that key; a language left with no keys is removed altogether.
-- p_patch = {} with p_clear = true removes the whole language. Returns the template's new
-- cover_locales. Only an admin may call it; the caller expires the catalogue cache.

create function public.admin_set_template_locale_cover(p_actor uuid, p_template_id text, p_locale text, p_patch jsonb, p_clear boolean default false)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_current jsonb;
  v_next jsonb;
  v_result jsonb;
  v_key text;
  v_value jsonb;
begin
  if p_actor is null or not exists (select 1 from public.profiles p where p.id = p_actor and p.role = 'admin') then
    raise exception 'NOT_ADMIN';
  end if;
  if p_locale is null or p_locale !~ '^[a-z]{2,3}(-[a-z0-9]{2,8})?$' then
    raise exception 'INVALID_INPUT' using detail = 'unknown language code';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'INVALID_INPUT' using detail = 'patch must be an object';
  end if;
  for v_key, v_value in select e.key, e.value from jsonb_each(p_patch) as e(key, value) loop
    if v_key not in ('before', 'after', 'video', 'poster', 'media') then
      raise exception 'INVALID_INPUT' using detail = 'unknown cover key';
    end if;
    if jsonb_typeof(v_value) = 'null' then
      continue;
    end if;
    if v_key = 'media' and (v_value #>> '{}') not in ('animated', 'video') then
      raise exception 'INVALID_INPUT' using detail = 'media must be animated or video';
    end if;
    if v_key <> 'media' and (jsonb_typeof(v_value) <> 'string' or (v_value #>> '{}') !~ '^https://') then
      raise exception 'INVALID_INPUT' using detail = 'cover URLs must be https';
    end if;
  end loop;

  select t.cover_locales into v_current from public.templates t where t.id = p_template_id for update;
  if not found then
    raise exception 'TEMPLATE_NOT_FOUND';
  end if;

  if p_clear then
    v_next := '{}'::jsonb;
  else
    v_next := jsonb_strip_nulls(coalesce(v_current -> p_locale, '{}'::jsonb) || p_patch);
  end if;
  v_result := case when v_next = '{}'::jsonb then v_current - p_locale else jsonb_set(v_current, array[p_locale], v_next) end;

  update public.templates t set cover_locales = v_result where t.id = p_template_id;
  return v_result;
end;
$$;

revoke execute on function public.admin_set_template_locale_cover(uuid, text, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_template_locale_cover(uuid, text, text, jsonb, boolean) to service_role;
