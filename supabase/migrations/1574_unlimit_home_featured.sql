-- Widen the existing rank constraint while preserving all existing rows and callers.
alter table public.templates
  drop constraint templates_featured_rank_check,
  add constraint templates_featured_rank_check
  check (featured_rank is null or featured_rank >= 1);

create or replace function public.admin_set_featured_templates(p_ids text[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_ids text[] := coalesce(p_ids, '{}');
begin
  if cardinality(v_ids) <> (select count(distinct id) from unnest(v_ids) as u(id)) then
    raise exception 'featured templates must not repeat' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(v_ids) as u(id)
    where not exists (
      select 1 from public.templates t where t.id = u.id and t.is_active and 'web' = any (t.visible_in)
    )
  ) then
    raise exception 'only published web templates can be featured' using errcode = '22023';
  end if;

  update public.templates set featured_rank = null where featured_rank is not null;
  update public.templates t
  set featured_rank = o.position
  from unnest(v_ids) with ordinality as o(id, position)
  where t.id = o.id;
end;
$$;

