-- 删除已下架模板 (Owner 2026-11-13). A soft delete: the row stays, marked deleted_at, because works,
-- jobs and requests point at it (generation_jobs and template_requests reference templates ON
-- DELETE RESTRICT; favourites, prompt versions, test runs and sync history would cascade away).
-- A deleted template is unpublished, in no series and off 首页精选, and stays that way: the guard
-- trigger refuses any later update that would publish it, file it in a series or feature it, so
-- every path (admin switch, series save, sync) keeps the rule without changing each of them.
-- The admin list, the series member picker and 分类管理's template counts leave deleted rows out.
-- Expand-only: a nullable column, the audit action list widened (every value accepted before still
-- is), a trigger, a new function, and two read functions replaced with the same signatures.

alter table public.templates add column deleted_at timestamptz;

alter table public.admin_audit_log drop constraint admin_audit_log_action_check,
  add constraint admin_audit_log_action_check check (action in (
  'ban_user','unban_user','view_work','replay_checkout','decide_refund','submit_dispute',
  'clawback_payment','save_code','set_code_active','affiliate_create','affiliate_decide',
  'affiliate_set','affiliate_rebind','affiliate_adjust','affiliate_commission_release',
  'affiliate_payout_decide','affiliate_settings','affiliate_recompute','waffo_renewal_settled',
  'waffo_renewal_refunded','catalog_save','catalog_prepare','catalog_publish','catalog_retry',
  'catalog_archive','catalog_waffo','gallery_setting','moderate_work','template_sync_active',
  'template_sync_sale','series_sync_active','template_apply_active','template_apply_cover',
  'series_set_active','series_set_show_members','template_delete'));

create function admin.guard_deleted_template() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.deleted_at is not null and new.deleted_at is null then
    raise exception 'TEMPLATE_DELETED' using detail = '已删除的模板不能恢复';
  end if;
  if new.deleted_at is not null and (new.is_active or new.series_id is not null or new.featured_rank is not null) then
    raise exception 'TEMPLATE_DELETED' using detail = '已删除的模板不能上架、加入系列或设为首页精选';
  end if;
  return new;
end $$;
revoke all on function admin.guard_deleted_template() from public, anon, authenticated, service_role;

create trigger template_deleted_guard
  before update of deleted_at, is_active, series_id, featured_rank on public.templates
  for each row execute function admin.guard_deleted_template();

-- Deletes one unpublished, non-built-in template. Idempotent: deleting it again changes nothing
-- and writes no second audit row. Takes the same locks as a series save (category tree shared,
-- then the series lock, then the row), since it takes the template out of its series. Security
-- definer only to write admin_audit_log; callable by the service role alone.
create function public.admin_delete_template(p_actor uuid, p_id text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  t public.templates;
  v_system boolean;
begin
  if coalesce(current_setting('role', true), 'none') <> 'service_role' and session_user <> 'postgres' then
    raise exception 'FORBIDDEN';
  end if;
  if not exists(select 1 from public.profiles where id = p_actor and role = 'admin' and banned_at is null) then
    raise exception 'NOT_ADMIN';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.category_tree', 0));
  perform pg_advisory_xact_lock(hashtextextended('shotviva.template_series', 0));
  select * into t from public.templates where id = p_id for update;
  if not found then raise exception 'TEMPLATE_MISSING'; end if;
  select c.is_system into v_system from public.template_categories c where c.key = t.category_key;
  if coalesce(v_system, false) or t.id in ('freeform', 'edit') then raise exception 'TEMPLATE_BUILT_IN'; end if;
  if t.deleted_at is not null then return false; end if;
  if t.is_active then raise exception 'TEMPLATE_LIVE'; end if;
  update public.templates set deleted_at = now(), series_id = null, series_sort_order = 0, featured_rank = null
    where id = p_id;
  insert into public.admin_audit_log(action, user_id, target_id, reason)
    values ('template_delete', p_actor, p_id, '模板列表删除已下架模板');
  return true;
end $$;
revoke all on function public.admin_delete_template(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_delete_template(uuid, text) to service_role;

-- 系列管理's member picker: as 1087, without deleted templates.
create or replace function public.admin_series_candidates(p_search text, p_after text)
returns table(id text, name text, cover_url text, series_id uuid, is_active boolean)
language sql stable set search_path = '' as $$
  select t.id, coalesce(nullif(t.translations #>> '{zh,name}',''),t.name),
         coalesce(t.cover_after_url,t.cover_locales #>> '{zh,after}',t.cover_locales #>> '{en,after}'),
         t.series_id,t.is_active
    from public.templates t join public.template_categories c on c.key=t.category_key
   where not c.is_system and t.id not in ('freeform','edit') and t.deleted_at is null and (p_after is null or t.id>p_after)
     and (p_search='' or strpos(lower(t.id),lower(p_search))>0 or strpos(lower(t.name),lower(p_search))>0
          or strpos(lower(t.translations #>> '{zh,name}'),lower(p_search))>0)
   order by t.id limit 31
$$;

-- 分类管理's per-category count: deleted templates no longer count.
create or replace function public.admin_assigned_template_count(public.template_categories) returns bigint
language sql stable set search_path = '' as $$
  select case when $1.parent_id is null then
    (select count(*) from public.templates t where t.category_key=$1.key and t.subcategory_key is null and t.deleted_at is null)
  else
    (select count(*) from public.templates t where t.subcategory_key=$1.key and t.deleted_at is null)
  end
$$;
