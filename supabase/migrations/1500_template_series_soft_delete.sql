-- 删除已下架的系列 (Owner 2026-11-14). A soft delete, as for templates (1401): the row stays, marked
-- deleted_at, so the T93 sync can tell "deleted on the test site" from "never existed" by slug and
-- carry the delete to production (1502) instead of bringing the series back. Its slug stays taken.
-- Deleting never deletes or unpublishes a template: the members are detached (series_id null,
-- series_sort_order 0) in the same transaction and keep their category placement and state.
-- A deleted series is unpublished and stays that way with no members: the guard on
-- template_series refuses publishing or restoring it, the guard on templates refuses filing any
-- template in it, so every path (series save, batch flag, member sync, template sync, bulk
-- membership) keeps the rule without changing each of them.
-- Expand-only: a nullable column, the audit action list widened (every value accepted before still
-- is, including 1420's provider_declare_tiers), two triggers and a new function. Until a series is
-- deleted, which only the new code can do, nothing the deployed code reads changes.

alter table public.template_series add column deleted_at timestamptz;

alter table public.admin_audit_log drop constraint admin_audit_log_action_check,
  add constraint admin_audit_log_action_check check (action in (
  'ban_user','unban_user','view_work','replay_checkout','decide_refund','submit_dispute',
  'clawback_payment','save_code','set_code_active','affiliate_create','affiliate_decide',
  'affiliate_set','affiliate_rebind','affiliate_adjust','affiliate_commission_release',
  'affiliate_payout_decide','affiliate_settings','affiliate_recompute','waffo_renewal_settled',
  'waffo_renewal_refunded','catalog_save','catalog_prepare','catalog_publish','catalog_retry',
  'catalog_archive','catalog_waffo','gallery_setting','moderate_work','template_sync_active',
  'template_sync_sale','series_sync_active','template_apply_active','template_apply_cover',
  'series_set_active','series_set_show_members','template_delete','provider_declare_tiers',
  'series_delete','series_sync_delete'));

create function admin.guard_deleted_series() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.deleted_at is not null and new.deleted_at is null then
    raise exception 'SERIES_DELETED' using detail = '已删除的系列不能恢复';
  end if;
  if new.deleted_at is not null and new.is_active then
    raise exception 'SERIES_DELETED' using detail = '已删除的系列不能上架';
  end if;
  return new;
end $$;
revoke all on function admin.guard_deleted_series() from public, anon, authenticated, service_role;

create trigger series_deleted_guard
  before update of deleted_at, is_active on public.template_series
  for each row execute function admin.guard_deleted_series();

-- One primary-key read, only when a template's series changes to a non-null one.
create function admin.guard_deleted_series_member() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.series_id is not null and (tg_op = 'INSERT' or new.series_id is distinct from old.series_id)
     and exists(select 1 from public.template_series s where s.id = new.series_id and s.deleted_at is not null) then
    raise exception 'SERIES_DELETED' using detail = '已删除的系列不能加入模板';
  end if;
  return new;
end $$;
revoke all on function admin.guard_deleted_series_member() from public, anon, authenticated, service_role;

create trigger template_series_member_guard
  before insert or update of series_id on public.templates
  for each row execute function admin.guard_deleted_series_member();

-- Deletes one unpublished series and moves its members out; returns how many it moved out, or
-- null when the series was already deleted (idempotent: no second audit row). Same lock order as
-- a series save: category tree shared, the series lock, then the rows. Security definer only to
-- write admin_audit_log; callable by the service role alone.
create function public.admin_delete_template_series(p_actor uuid, p_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  s public.template_series;
  v_moved integer;
begin
  if coalesce(current_setting('role', true), 'none') <> 'service_role' and session_user <> 'postgres' then
    raise exception 'FORBIDDEN';
  end if;
  if not exists(select 1 from public.profiles where id = p_actor and role = 'admin' and banned_at is null) then
    raise exception 'NOT_ADMIN';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.category_tree', 0));
  perform pg_advisory_xact_lock(hashtextextended('shotviva.template_series', 0));
  select * into s from public.template_series where id = p_id for update;
  if not found then raise exception 'SERIES_MISSING'; end if;
  if s.deleted_at is not null then return null; end if;
  if s.is_active then raise exception 'SERIES_LIVE'; end if;
  perform 1 from public.templates where series_id = p_id order by id for update;
  update public.templates set series_id = null, series_sort_order = 0 where series_id = p_id;
  get diagnostics v_moved = row_count;
  update public.template_series set deleted_at = now() where id = p_id;
  insert into public.admin_audit_log(action, user_id, target_id, reason)
    values ('series_delete', p_actor, p_id::text, format('系列管理删除已下架系列 %s，移出 %s 个模板', s.slug, v_moved));
  return v_moved;
end $$;
revoke all on function public.admin_delete_template_series(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_template_series(uuid, uuid) to service_role;
