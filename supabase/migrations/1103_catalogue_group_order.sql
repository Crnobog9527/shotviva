-- Reorder the selected publication status against current membership under the T76 lock.
create or replace function public.admin_set_template_order(p_group text, p_ids text[], p_actor uuid)
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
  if not exists (select 1 from public.profiles p where p.id = p_actor and p.role = 'admin' and p.banned_at is null) then
    raise exception 'NOT_ADMIN';
  end if;
  if p_group is null or p_group not in ('catalogue', 'featured', 'active', 'inactive') then
    raise exception 'INVALID_INPUT' using detail = 'unknown catalogue group';
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
    when 'featured' then t.featured_rank is not null
    else t.id <> 'edit' and t.is_active = (p_group = 'active')
  end;

  if cardinality(v_members) <> cardinality(v_ids) or not (v_members @> v_ids) then
    raise exception 'ORDER_MISMATCH'
      using detail = format('%s ids given, the %s group has %s', cardinality(v_ids), p_group, cardinality(v_members));
  end if;

  -- Keep the other group's latest order, including changes made after this editor loaded.
  if p_group in ('active', 'inactive') then
    select array_agg(case when slots.is_active = (p_group = 'active') then v_ids[slots.pos] else slots.id end
                     order by slots.sort_order, slots.id)
      into v_ids
    from (select t.id, t.is_active, t.sort_order,
                 row_number() over (partition by t.is_active order by t.sort_order, t.id)::int as pos
            from public.templates t where t.id <> 'edit') slots;
  end if;

  if p_group <> 'featured' then
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
