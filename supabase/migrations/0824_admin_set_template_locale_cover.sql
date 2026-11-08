-- T87: the admin's own uploads and removals of one language's cover (ARCHITECTURE §8.3: each
-- language tab uploads, replaces and deletes on its own). One call merges p_patch into
-- templates.cover_locales -> p_locale:
--   keys     before, after, video, poster (URLs under p_assets_base, our public assets origin, which
--            the server passes from NEXT_PUBLIC_ASSETS_BASE_URL) and media ('animated' | 'video');
--   a null   removes that key; a language left with no keys is removed altogether;
--   p_clear  removes the whole language (p_patch = {}).
-- A live web template must keep a "before" and an "after" that every launched page can show (the
-- publish rule of 0825: each in the common cover or in a launched language's own; p_locales is the
-- launched languages): a change that takes the last one away raises COVER_STILL_NEEDED and changes
-- nothing. A template that did not meet the rule before is not held to it (an upload may be the
-- first step of fixing it). Returns the new cover_locales. Only an admin may call it; the caller expires
-- the catalogue cache.

-- Whether every launched page can show a "before" and an "after" (0825's rule): each in the common
-- columns or in a launched language's own cover.
create function public._template_has_cover_parts(p_before text, p_after text, p_locales_json jsonb, p_locales text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (nullif(btrim(p_before), '') is not null or exists (
            select 1 from unnest(coalesce(p_locales, '{}')) as l(code) where nullif(btrim(p_locales_json -> l.code ->> 'before'), '') is not null))
     and (nullif(btrim(p_after), '') is not null or exists (
            select 1 from unnest(coalesce(p_locales, '{}')) as l(code) where nullif(btrim(p_locales_json -> l.code ->> 'after'), '') is not null))
$$;

revoke execute on function public._template_has_cover_parts(text, text, jsonb, text[]) from public, anon, authenticated;
grant execute on function public._template_has_cover_parts(text, text, jsonb, text[]) to service_role;

create function public.admin_set_template_locale_cover(
  p_actor uuid,
  p_template_id text,
  p_locale text,
  p_patch jsonb,
  p_assets_base text,
  p_locales text[],
  p_clear boolean default false
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row public.templates;
  v_live boolean;
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
  if p_assets_base is null or p_assets_base !~ '^https://[^/]+(/[^?#]*)?$' then
    raise exception 'INVALID_INPUT' using detail = 'assets base must be an https URL';
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
    if v_key <> 'media' and (jsonb_typeof(v_value) <> 'string'
        or left(v_value #>> '{}', length(rtrim(p_assets_base, '/')) + 1) <> rtrim(p_assets_base, '/') || '/') then
      raise exception 'INVALID_INPUT' using detail = 'cover URLs must be on the assets origin';
    end if;
  end loop;

  select * into v_row from public.templates t where t.id = p_template_id for update;
  if not found then
    raise exception 'TEMPLATE_NOT_FOUND';
  end if;

  if p_clear then
    v_next := '{}'::jsonb;
  else
    v_next := jsonb_strip_nulls(coalesce(v_row.cover_locales -> p_locale, '{}'::jsonb) || p_patch);
  end if;
  v_result := case when v_next = '{}'::jsonb then v_row.cover_locales - p_locale else jsonb_set(v_row.cover_locales, array[p_locale], v_next) end;

  -- The publish rule, for a template visitors can see: some "before" and some "after" left.
  v_live := v_row.is_active and 'web' = any (v_row.visible_in);
  if v_live and public._template_has_cover_parts(v_row.cover_before_url, v_row.cover_after_url, v_row.cover_locales, p_locales)
     and not public._template_has_cover_parts(v_row.cover_before_url, v_row.cover_after_url, v_result, p_locales) then
    raise exception 'COVER_STILL_NEEDED';
  end if;

  update public.templates t set cover_locales = v_result where t.id = p_template_id;
  return v_result;
end;
$$;

revoke execute on function public.admin_set_template_locale_cover(uuid, text, text, jsonb, text, text[], boolean) from public, anon, authenticated;
grant execute on function public.admin_set_template_locale_cover(uuid, text, text, jsonb, text, text[], boolean) to service_role;
