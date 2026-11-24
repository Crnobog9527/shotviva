-- One language's whole 分语言展示 draft (the admin arranges, then saves once), applied in one
-- call so a save is all-or-nothing: the changed sibling groups and, when it changed, the featured
-- list. Expand-only: it reuses the checks of the two functions from migration 1575, which stay
-- as they are. p_groups is a json array of {"parent": key or null, "keys": [...]}; empty keys put
-- the group back on the shared order. p_featured null leaves the featured list alone; an empty
-- array puts it back on the shared list. Any failure raises, so nothing of the draft is kept.
create function public.admin_set_locale_display(p_locale text, p_groups jsonb, p_featured text[], p_actor uuid)
returns void language plpgsql set search_path = '' as $$
declare
  v_groups jsonb := coalesce(p_groups, '[]'::jsonb);
  v_group jsonb;
begin
  if not exists (select 1 from public.profiles p where p.id = p_actor and p.role = 'admin' and p.banned_at is null) then
    raise exception 'NOT_ADMIN';
  end if;
  if jsonb_typeof(v_groups) <> 'array' then
    raise exception 'INVALID_INPUT' using detail = 'groups must be an array';
  end if;
  if p_locale is null or p_locale not in ('en', 'zh') then
    raise exception 'INVALID_INPUT' using detail = 'unknown language';
  end if;
  -- '' stands for the top level: category keys are never empty.
  if (select count(*) <> count(distinct coalesce(e.g->>'parent', '')) from jsonb_array_elements(v_groups) as e(g)) then
    raise exception 'INVALID_INPUT' using detail = 'a sibling group appears twice';
  end if;
  for v_group in select g from jsonb_array_elements(v_groups) as e(g) loop
    if jsonb_typeof(v_group) <> 'object' or jsonb_typeof(coalesce(v_group->'keys', 'null')) <> 'array' then
      raise exception 'INVALID_INPUT' using detail = 'each group needs a keys array';
    end if;
    perform public.admin_set_category_locale_order(
      p_locale, v_group->>'parent', array(select t.k from jsonb_array_elements_text(v_group->'keys') with ordinality as t(k, n) order by t.n),
      p_actor);
  end loop;
  if p_featured is not null then
    perform public.admin_set_featured_locale(p_locale, p_featured, p_actor);
  end if;
end $$;

revoke all on function public.admin_set_locale_display(text, jsonb, text[], uuid) from public, anon, authenticated;
grant execute on function public.admin_set_locale_display(text, jsonb, text[], uuid) to service_role;
