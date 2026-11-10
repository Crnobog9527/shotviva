-- Preserve every unaffected template’s stored order when reordering a catalogue group.
create function public.admin_set_template_order(p_group text, p_ids text[], p_actor uuid, p_expected_ids text[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_ids text[] := coalesce(p_ids, '{}');
  v_members text[];
  order_slots integer[];
  upper_bounds bigint[] := '{}';
  max_order bigint := 2147483647;
  assigned_order bigint := -2147483648;
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

  select coalesce(array_agg(t.id order by case when p_group = 'featured' then t.featured_rank else t.sort_order end, t.id), '{}'),
         array_agg(t.sort_order order by t.sort_order, t.id)
    into v_members, order_slots
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

  if p_expected_ids is not null and p_expected_ids <> v_members then
    raise exception 'ORDER_MISMATCH' using detail = 'the displayed order changed';
  end if;

  if p_group <> 'featured' then
    if v_ids = v_members then
      return;
    end if;

    -- An unmoved row is an anchor. Work backwards to find the highest integer
    -- each slot may occupy. Equal integers follow id order, exactly as in the UI.
    for i in reverse cardinality(v_ids)..1 loop
      if v_ids[i] > v_ids[i + 1] then
        max_order := max_order - 1;
      end if;
      if v_ids[i] = v_members[i] then
        if order_slots[i] > max_order then
          raise exception 'ORDER_TIED';
        end if;
        max_order := order_slots[i];
      end if;
      upper_bounds[i] := max_order;
    end loop;

    -- Work forwards and reuse the old slot number whenever it fits. For a
    -- duplicate legacy number, stay within both the previous row and next anchor.
    for i in 1..cardinality(v_ids) loop
      if v_ids[i - 1] > v_ids[i] then
        assigned_order := assigned_order + 1;
      end if;
      if assigned_order > upper_bounds[i] then
        raise exception 'ORDER_TIED';
      end if;
      assigned_order := greatest(assigned_order, least(order_slots[i], upper_bounds[i]));
      order_slots[i] := assigned_order;
    end loop;
    update public.templates t
    set sort_order = s.slot
    from unnest(v_ids, order_slots) as s(id, slot)
    where t.id = s.id and t.sort_order <> s.slot;
    return;
  end if;

  -- Cleared first so the one-per-position index never sees two rows on one rank mid-way.
  update public.templates set featured_rank = null where featured_rank is not null;
  update public.templates t
  set featured_rank = o.position
  from unnest(v_ids) with ordinality as o(id, position)
  where t.id = o.id;
end;
$$;

revoke all on function public.admin_set_template_order(text, text[], uuid, text[]) from public, anon, authenticated;
grant execute on function public.admin_set_template_order(text, text[], uuid, text[]) to service_role;

-- Deployed clients without a displayed order still receive membership and slot protection.
create or replace function public.admin_set_template_order(p_group text, p_ids text[], p_actor uuid)
returns void language sql set search_path = '' as $$
  select public.admin_set_template_order(p_group, p_ids, p_actor, null);
$$;
