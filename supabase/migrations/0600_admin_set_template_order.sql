-- T76: drag-to-reorder in /admin/templates (ARCHITECTURE §10 「拖动排序」). One drop saves the
-- whole group's new order in one call and one transaction, never one row at a time.
--
--   p_group 'catalogue'  every template the admin list shows (all but the built-in `edit`,
--                        which has its own page): sort_order becomes 10, 20, 30, ...
--   p_group 'featured'   the home featured list (T53): featured_rank becomes 1..n
--
-- p_ids must be exactly the group, each id once: a list that misses a member or names one
-- outside the group means the admin's page is out of date (a template was added, removed or
-- un-featured since it loaded), and saving it would scramble the order, so nothing changes.
-- Adding to or removing from the featured list stays with admin_set_featured_templates.
-- Only an admin may save, like admin_set_system_setting (0421).

create function public.admin_set_template_order(p_group text, p_ids text[], p_actor uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_ids text[] := coalesce(p_ids, '{}');
  v_members text[];
begin
  if p_actor is null then
    raise exception 'INVALID_INPUT' using detail = 'actor is required';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_actor and p.role = 'admin') then
    raise exception 'NOT_ADMIN';
  end if;
  if p_group is null or p_group not in ('catalogue', 'featured') then
    raise exception 'INVALID_INPUT' using detail = 'group must be catalogue or featured';
  end if;
  if cardinality(v_ids) <> (select count(distinct id) from unnest(v_ids) as u(id)) then
    raise exception 'INVALID_INPUT' using detail = 'ids must not repeat';
  end if;

  -- Holds off other template writes for these few milliseconds, so the membership checked
  -- below is still the membership when the new order is written. Reads are not blocked.
  lock table public.templates in share row exclusive mode;

  select coalesce(array_agg(t.id), '{}') into v_members
  from public.templates t
  where case p_group
    when 'catalogue' then t.id <> 'edit'
    else t.featured_rank is not null
  end;

  if cardinality(v_members) <> cardinality(v_ids) or not (v_members @> v_ids) then
    raise exception 'ORDER_MISMATCH'
      using detail = format('%s ids given, the %s group has %s', cardinality(v_ids), p_group, cardinality(v_members));
  end if;

  if p_group = 'catalogue' then
    update public.templates t
    set sort_order = o.position * 10
    from unnest(v_ids) with ordinality as o(id, position)
    where t.id = o.id and t.sort_order is distinct from o.position * 10;
  else
    -- Cleared first so the one-per-position index never sees two rows on one rank mid-way.
    update public.templates set featured_rank = null where featured_rank is not null;
    update public.templates t
    set featured_rank = o.position
    from unnest(v_ids) with ordinality as o(id, position)
    where t.id = o.id;
  end if;
end;
$$;

revoke execute on function public.admin_set_template_order(text, text[], uuid) from public, anon, authenticated;
grant execute on function public.admin_set_template_order(text, text[], uuid) to service_role;
