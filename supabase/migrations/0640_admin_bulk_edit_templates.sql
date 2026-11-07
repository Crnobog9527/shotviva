-- T79: batch edit in /admin/templates (ARCHITECTURE §10 「模板批量编辑」). The ticked templates get
-- the same new prices, entry points and/or quality in one call and one transaction.
--
-- p_patch holds only what changes (at least one key):
--   credits_cost  {"1k"?, "2k"?, "3k"?}  each tier on its own, 1..999; tiers left out keep theirs
--   visible_in    ["web"] | ["partner"] | ["web", "partner"]
--   quality       "high" | "medium"
-- p_floor is the floor table the server owns (modules/image/credits-floor.ts), the same one the
-- single save checks against: {"high": {"1k", "2k", "3k"}, "medium": {...}}.
--
-- Every template is checked as it would be after the edit: each tier at or above the floor of
-- its (possibly new) quality (§6.1), and a live template newly put on the web must already have
-- what a web card shows (English description, both covers; T60 publish rules). The built-in
-- templates `edit` (photo edit, its own page) and `freeform` (the partner API's free prompt) are
-- never batch-edited: they come back as `system`. If any template
-- fails, nothing changes and the failures come back, one entry per problem:
--   {"failures": [{"id", "name", "reason": "below_floor", "resolution", "floor", "given"}
--                 | {"id", "name", "reason": "web_incomplete" | "not_found" | "system"}]}
-- Otherwise {"failures": [], "changed": n}. Taking a template off the web also takes it off the
-- home featured list (templates_featured_live_check). Only an admin may save (as in 0600).

create function public.admin_bulk_edit_templates(p_ids text[], p_patch jsonb, p_floor jsonb, p_actor uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_ids text[] := array(select distinct u.id from unnest(coalesce(p_ids, '{}')) as u(id));
  v_patch jsonb := coalesce(p_patch, '{}');
  v_cost jsonb := coalesce(p_patch -> 'credits_cost', '{}');
  v_visible text[];
  v_failures jsonb;
  v_changed integer;
begin
  if p_actor is null then
    raise exception 'INVALID_INPUT' using detail = 'actor is required';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_actor and p.role = 'admin') then
    raise exception 'NOT_ADMIN';
  end if;
  if cardinality(v_ids) = 0 or cardinality(v_ids) > 200 then
    raise exception 'INVALID_INPUT' using detail = 'between 1 and 200 templates';
  end if;
  if jsonb_typeof(v_patch) <> 'object' or v_patch = '{}' or v_patch - 'credits_cost' - 'visible_in' - 'quality' <> '{}' then
    raise exception 'INVALID_INPUT' using detail = 'patch must name credits_cost, visible_in or quality';
  end if;
  if v_patch ? 'quality' and (v_patch ->> 'quality') is distinct from 'high' and (v_patch ->> 'quality') is distinct from 'medium' then
    raise exception 'INVALID_INPUT' using detail = 'quality must be high or medium';
  end if;
  if jsonb_typeof(v_cost) <> 'object' then
    raise exception 'INVALID_INPUT' using detail = 'credits_cost must be an object';
  end if;
  if exists (
    select 1 from jsonb_each(v_cost) as e(key, value)
    where e.key not in ('1k', '2k', '3k') or jsonb_typeof(e.value) <> 'number' or e.value::text !~ '^[1-9][0-9]{0,2}$'
  ) then
    raise exception 'INVALID_INPUT' using detail = 'credits_cost tiers must be whole numbers 1..999';
  end if;
  if v_patch ? 'visible_in' then
    if jsonb_typeof(v_patch -> 'visible_in') <> 'array' then
      raise exception 'INVALID_INPUT' using detail = 'visible_in must be an array';
    end if;
    v_visible := array(select distinct x from jsonb_array_elements_text(v_patch -> 'visible_in') as v(x) order by x desc);
    if cardinality(v_visible) = 0 or not (v_visible <@ array['web', 'partner']) then
      raise exception 'INVALID_INPUT' using detail = 'visible_in must be web, partner or both';
    end if;
  end if;
  if p_floor is null or exists (
    select 1 from unnest(array['high', 'medium']) as q(quality), unnest(array['1k', '2k', '3k']) as r(res)
    where jsonb_typeof(p_floor -> q.quality -> r.res) is distinct from 'number'
  ) then
    raise exception 'INVALID_INPUT' using detail = 'floor table is incomplete';
  end if;

  -- The rows are checked and written under one lock, so no other save slips in between.
  perform 1 from public.templates t where t.id = any (v_ids) for update;

  with planned as (
    select a.id, t.id is not null as found, coalesce(t.name, a.id) as name, t.is_active,
           t.description, t.cover_before_url, t.cover_after_url, t.visible_in as old_visible,
           coalesce(v_patch ->> 'quality', t.quality) as quality,
           t.credits_cost || v_cost as credits_cost,
           coalesce(v_visible, t.visible_in) as visible_in
    from unnest(v_ids) as a(id)
    left join public.templates t on t.id = a.id
  ),
  failures as (
    select jsonb_build_object('id', p.id, 'name', p.name, 'reason', case when p.found then 'system' else 'not_found' end) as failure
    from planned p
    where not p.found or p.id in ('edit', 'freeform')
    union all
    select jsonb_build_object(
      'id', p.id, 'name', p.name, 'reason', 'below_floor', 'resolution', r.res,
      'floor', (p_floor -> p.quality ->> r.res)::integer, 'given', (p.credits_cost ->> r.res)::integer
    )
    from planned p
    cross join unnest(array['1k', '2k', '3k']) as r(res)
    where p.found and p.id not in ('edit', 'freeform') and (p.credits_cost ->> r.res)::integer < (p_floor -> p.quality ->> r.res)::integer
    union all
    select jsonb_build_object('id', p.id, 'name', p.name, 'reason', 'web_incomplete')
    from planned p
    where p.found and p.id not in ('edit', 'freeform') and p.is_active
      and 'web' = any (p.visible_in) and not ('web' = any (p.old_visible))
      and (nullif(btrim(p.description), '') is null or nullif(btrim(p.cover_before_url), '') is null
           or nullif(btrim(p.cover_after_url), '') is null)
  )
  select coalesce(jsonb_agg(f.failure), '[]'::jsonb) into v_failures from failures f;

  if jsonb_array_length(v_failures) > 0 then
    return jsonb_build_object('failures', v_failures);
  end if;

  update public.templates t
  set quality = coalesce(v_patch ->> 'quality', t.quality),
      credits_cost = t.credits_cost || v_cost,
      visible_in = coalesce(v_visible, t.visible_in),
      featured_rank = case when v_visible is not null and not ('web' = any (v_visible)) then null else t.featured_rank end
  where t.id = any (v_ids);
  get diagnostics v_changed = row_count;

  return jsonb_build_object('failures', '[]'::jsonb, 'changed', v_changed);
end;
$$;

revoke execute on function public.admin_bulk_edit_templates(text[], jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.admin_bulk_edit_templates(text[], jsonb, jsonb, uuid) to service_role;
