-- PR-2 of 1K / 2K / 4K (contract): the site's top tier has been called 4k since #534, while the
-- database kept storing 3k behind the app's fetch shim. 1431 renames the stored id. These helpers
-- only add functions: nothing calls them until 1431, so this file changes no behaviour.
--
-- canonical_resolution: '3k' (the old name) and '4k' are the same tier; everything else is as given.
create function public.canonical_resolution(p text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select case when p in ('3k','4k') then '4k' else p end
$$;

-- Both stored spellings of a tier, for history that keeps 3k (generation_jobs.inputs): matching
-- `= any(...)` keeps an index on the raw value usable.
create function public.resolution_aliases(p text) returns text[]
language sql immutable parallel safe set search_path = '' as $$
  select case when public.canonical_resolution(p) = '4k' then array['4k','3k'] else array[p] end
$$;

-- A tier list in canonical names, order kept, duplicates dropped.
create function public.canonical_tier_array(p text[]) returns text[]
language sql immutable parallel safe set search_path = '' as $$
  select case when p is null then null else coalesce(array(
    select r from (select public.canonical_resolution(x) r, min(i) i from unnest(p) with ordinality u(x,i) group by 1) s order by i
  ), '{}') end
$$;

-- Any jsonb from a caller (or a stored snapshot) with tier names in canonical form, at any depth:
-- object keys '3k' become '4k' (an object that has both keeps both, so a check that lists the tiers
-- refuses it rather than one price silently replacing the other), and the
-- string values of the known tier fields (resolution, resolutions, unpriced_resolutions,
-- unpricedResolutions, resolutionLimit), directly or as array items. Other text is never touched.
-- The same fields as the app's src/core/templates/db-resolution.ts.
create function public.canonical_tiers(p jsonb, p_tier_field boolean default false) returns jsonb
language plpgsql immutable parallel safe set search_path = '' as $$
declare
  k text; v jsonb; out jsonb;
  tier_fields constant text[] := array['resolution','resolutions','unpriced_resolutions','unpricedResolutions','resolutionLimit'];
begin
  if p is null then return null; end if;
  case jsonb_typeof(p)
    when 'object' then
      out := '{}';
      for k, v in select * from jsonb_each(p) loop
        out := out || jsonb_build_object(case when k = '3k' and not p ? '4k' then '4k' else k end, public.canonical_tiers(v, k = any(tier_fields)));
      end loop;
      return out;
    when 'array' then
      return coalesce((select jsonb_agg(public.canonical_tiers(e, p_tier_field) order by i) from jsonb_array_elements(p) with ordinality a(e,i)), '[]');
    when 'string' then
      return case when p_tier_field then to_jsonb(public.canonical_resolution(p #>> '{}')) else p end;
    else
      return p;
  end case;
end;
$$;

-- Pure functions over their arguments (no table access): callable from triggers and from
-- functions that run as the calling role.
revoke all on function public.canonical_resolution(text), public.resolution_aliases(text),
  public.canonical_tier_array(text[]), public.canonical_tiers(jsonb, boolean) from public;
grant execute on function public.canonical_resolution(text), public.resolution_aliases(text),
  public.canonical_tier_array(text[]), public.canonical_tiers(jsonb, boolean) to anon, authenticated, service_role;
