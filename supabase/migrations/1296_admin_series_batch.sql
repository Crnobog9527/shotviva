-- 系列管理 batch tools (Owner 2026-11-12): drag the whole series list into a new order in one call,
-- and publish / unpublish or switch 「成员也在分类中单独展示」 for several series at once.
-- Both take the same locks as admin_save_template_series (category tree shared, then the series
-- lock, then rows by id), so they serialise with single saves and the T93 sync. Expand-only: the
-- audit action list is widened (every value accepted before still is), two functions are added.

alter table public.admin_audit_log drop constraint admin_audit_log_action_check,
  add constraint admin_audit_log_action_check check (action in (
  'ban_user','unban_user','view_work','replay_checkout','decide_refund','submit_dispute',
  'clawback_payment','save_code','set_code_active','affiliate_create','affiliate_decide',
  'affiliate_set','affiliate_rebind','affiliate_adjust','affiliate_commission_release',
  'affiliate_payout_decide','affiliate_settings','affiliate_recompute','waffo_renewal_settled',
  'waffo_renewal_refunded','catalog_save','catalog_prepare','catalog_publish','catalog_retry',
  'catalog_archive','catalog_waffo','gallery_setting','moderate_work','template_sync_active',
  'template_sync_sale','series_sync_active','template_apply_active','template_apply_cover',
  'series_set_active','series_set_show_members'));

-- The whole list in its new order: p_ids must be every series exactly once (anything else means
-- the list changed since it was loaded: SERIES_CHANGED). Positions become 10, 20, 30…; returns
-- how many rows moved.
create function public.admin_reorder_template_series(p_actor uuid, p_ids uuid[]) returns integer
language plpgsql set search_path = '' as $$
declare v_moved integer;
begin
  if not exists(select 1 from public.profiles where id = p_actor and role = 'admin' and banned_at is null) then
    raise exception 'NOT_ADMIN';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.category_tree', 0));
  perform pg_advisory_xact_lock(hashtextextended('shotviva.template_series', 0));
  perform 1 from public.template_series order by id for update;
  if p_ids is null or cardinality(p_ids) <> (select count(distinct i) from unnest(p_ids) i)
     or cardinality(p_ids) <> (select count(*) from public.template_series)
     or exists(select 1 from unnest(p_ids) i where not exists(select 1 from public.template_series s where s.id = i)) then
    raise exception 'SERIES_CHANGED';
  end if;
  update public.template_series s set sort_order = m.ord::integer * 10
    from unnest(p_ids) with ordinality as m(id, ord) where s.id = m.id and s.sort_order <> m.ord * 10;
  get diagnostics v_moved = row_count;
  return v_moved;
end $$;
revoke all on function public.admin_reorder_template_series(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.admin_reorder_template_series(uuid, uuid[]) to service_role;

-- One flag for several series in one transaction, with one audit row per series that changed
-- (series_set_active / series_set_show_members). Unpublishing needs a reason, as a single save
-- does. Security definer only to write admin_audit_log (service_role cannot insert into it);
-- callable by the service role alone. Returns how many series changed.
create function public.admin_set_template_series_flag(
  p_actor uuid, p_ids uuid[], p_field text, p_value boolean, p_reason text
) returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[];
  v_reason text := nullif(btrim(p_reason), '');
begin
  if coalesce(current_setting('role', true), 'none') <> 'service_role' and session_user <> 'postgres' then
    raise exception 'FORBIDDEN';
  end if;
  if not exists(select 1 from public.profiles where id = p_actor and role = 'admin' and banned_at is null) then
    raise exception 'NOT_ADMIN';
  end if;
  if p_field not in ('is_active', 'show_members') or p_value is null or p_ids is null
     or cardinality(p_ids) not between 1 and 200
     or cardinality(p_ids) <> (select count(distinct i) from unnest(p_ids) i) then
    raise exception 'INVALID_INPUT';
  end if;
  if p_field = 'is_active' and not p_value and v_reason is null then raise exception 'SERIES_REASON_REQUIRED'; end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.category_tree', 0));
  perform pg_advisory_xact_lock(hashtextextended('shotviva.template_series', 0));
  perform 1 from public.template_series where id = any(p_ids) order by id for update;
  if (select count(*) from public.template_series where id = any(p_ids)) <> cardinality(p_ids) then
    raise exception 'SERIES_CHANGED';
  end if;
  if p_field = 'is_active' then
    with changed as (update public.template_series set is_active = p_value
      where id = any(p_ids) and is_active <> p_value returning id) select array_agg(id) into v_ids from changed;
  else
    with changed as (update public.template_series set show_members = p_value
      where id = any(p_ids) and show_members <> p_value returning id) select array_agg(id) into v_ids from changed;
  end if;
  insert into public.admin_audit_log(action, user_id, target_id, reason)
    select case p_field when 'is_active' then 'series_set_active' else 'series_set_show_members' end,
      p_actor, i::text, format('系列管理批量%s：%s', case when p_field = 'is_active' then
        case when p_value then '上架' else '下架' end else
        case when p_value then '开启成员单独展示' else '关闭成员单独展示' end end,
        coalesce(v_reason, '无备注'))
    from unnest(coalesce(v_ids, '{}')) i;
  return coalesce(cardinality(v_ids), 0);
end $$;
revoke all on function public.admin_set_template_series_flag(uuid, uuid[], text, boolean, text) from public, anon, authenticated;
grant execute on function public.admin_set_template_series_flag(uuid, uuid[], text, boolean, text) to service_role;
