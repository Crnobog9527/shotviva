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
  lock table public.templates in share row exclusive mode;
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


-- Compare and save under the same lock used by featured reordering and all template writes.
create function public.admin_set_featured_templates(p_ids text[], p_expected_ids text[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_current text[];
begin
  lock table public.templates in share row exclusive mode;
  select coalesce(array_agg(id order by featured_rank), '{}'::text[]) into v_current
  from public.templates where featured_rank is not null;
  if v_current is distinct from p_expected_ids then
    raise exception 'FEATURED_CONFLICT';
  end if;
  perform public.admin_set_featured_templates(p_ids);
end;
$$;
revoke execute on function public.admin_set_featured_templates(text[], text[]) from public, anon, authenticated;
grant execute on function public.admin_set_featured_templates(text[], text[]) to service_role;
