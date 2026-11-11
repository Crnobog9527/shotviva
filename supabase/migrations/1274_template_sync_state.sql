-- T93 sync, 上下架 and 开放售卖 (Owner 2026-11-12, "以测试站为准"): a template's sale and publication,
-- and a series' publication, follow the test site, through every check production's admin applies.
-- The workflow names a production admin (SYNC_PRODUCTION_ACTOR_ID) as the actor: the functions refuse
-- anyone else, call the admin's own sale function with that actor, and audit each change in
-- admin_audit_log (1273) with the reason "T93 sync from preview run <run id>". New functions only.

-- One template's sale and publication. Going down: unpublish first, then close the sale (the admin
-- sale function refuses the other order). Going up: open the sale (admin_set_template_sale: floors,
-- unpriced tiers, its own event log), then publish, with the deferred publication checks (price
-- floor, sale binding, catalogue minimum) run at once rather than at commit, the live-card rule
-- (English description and covers on the web) and the sale route that makes a web template visible
-- (web_standard_sale_allowed). Any refusal rolls the whole call back, the sale included. The script
-- also runs the admin switch's own rules (planActiveChange) before asking to publish.
create or replace function public.sync_preview_template_state(p_actor uuid, p_id text, p_sale boolean, p_active boolean,
  p_run_id text, p_locales text[], p_validate_only boolean default false)
returns jsonb language plpgsql set search_path = '' as $$
declare
  t public.templates;
  v_sale boolean;
  v_reason text := 'T93 sync from preview run ' || p_run_id;
  v_result jsonb := jsonb_build_object('sale', 'unchanged', 'active', 'unchanged');
begin
  if p_sale is null or p_active is null or nullif(p_run_id, '') is null or (p_active and not p_sale) then
    raise exception 'INVALID_SYNC';
  end if;
  if not exists(select from public.profiles where id = p_actor and role = 'admin' and banned_at is null) then
    raise exception 'NOT_ADMIN';
  end if;
  select * into t from public.templates where id = p_id for update;
  if not found then raise exception 'TEMPLATE_MISSING'; end if;
  v_sale := exists(select from public.template_sale_approvals where template_id = p_id and enabled);
  if t.is_active and not p_active then
    update public.templates set is_active = false, featured_rank = null where id = p_id;
    insert into public.admin_audit_log(action, user_id, target_id, reason)
      values('template_sync_active', p_actor, p_id, v_reason || ': unpublished');
    v_result := v_result || jsonb_build_object('active', 'unpublished');
    t.is_active := false;
  end if;
  if v_sale is distinct from p_sale then
    perform public.admin_set_template_sale(p_actor, p_id, p_sale);
    insert into public.admin_audit_log(action, user_id, target_id, reason)
      values('template_sync_sale', p_actor, p_id, v_reason || case when p_sale then ': sale opened' else ': sale closed' end);
    v_result := v_result || jsonb_build_object('sale', case when p_sale then 'opened' else 'closed' end);
  end if;
  if p_active and not t.is_active then
    if 'web' = any(t.visible_in) and (nullif(btrim(t.description), '') is null or not public._template_has_cover_parts(
        t.cover_before_url, t.cover_after_url, t.cover_locales, p_locales)) then
      raise exception 'LIVE_TEMPLATE_INCOMPLETE';
    end if;
    update public.templates set is_active = true where id = p_id;
    set constraints all immediate;
    if 'web' = any(t.visible_in) and not admin.web_standard_sale_allowed(p_id) then
      raise exception 'SALE_ROUTE_NOT_ALLOWED';
    end if;
    insert into public.admin_audit_log(action, user_id, target_id, reason)
      values('template_sync_active', p_actor, p_id, v_reason || ': published');
    v_result := v_result || jsonb_build_object('active', 'published');
  end if;
  if p_validate_only then raise exception using errcode = 'Z9301'; end if;
  return v_result;
exception when sqlstate 'Z9301' then return v_result;
end $$;

-- One series' publication, after (going up) or before (going down) its members' own. Same locks and
-- order as admin_save_template_series.
create or replace function public.sync_preview_series_active(p_actor uuid, p_slug text, p_active boolean,
  p_run_id text, p_validate_only boolean default false)
returns text language plpgsql set search_path = '' as $$
declare
  previous public.template_series;
  v_result text := 'unchanged';
begin
  if p_active is null or nullif(p_run_id, '') is null then raise exception 'INVALID_SYNC'; end if;
  if not exists(select from public.profiles where id = p_actor and role = 'admin' and banned_at is null) then
    raise exception 'NOT_ADMIN';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.category_tree', 0));
  perform pg_advisory_xact_lock(hashtextextended('shotviva.template_series', 0));
  select * into previous from public.template_series where slug = p_slug for update;
  if previous.id is null then raise exception 'SERIES_MISSING'; end if;
  if previous.is_active is distinct from p_active then
    update public.template_series set is_active = p_active where id = previous.id;
    insert into public.admin_audit_log(action, user_id, target_id, reason)
      values('series_sync_active', p_actor, p_slug,
        'T93 sync from preview run ' || p_run_id || case when p_active then ': published' else ': unpublished' end);
    v_result := case when p_active then 'published' else 'unpublished' end;
  end if;
  if p_validate_only then raise exception using errcode = 'Z9301'; end if;
  return v_result;
exception when sqlstate 'Z9301' then return v_result;
end $$;

revoke all on function public.sync_preview_template_state(uuid, text, boolean, boolean, text, text[], boolean) from public, anon, authenticated;
grant execute on function public.sync_preview_template_state(uuid, text, boolean, boolean, text, text[], boolean) to service_role;
revoke all on function public.sync_preview_series_active(uuid, text, boolean, text, boolean) from public, anon, authenticated;
grant execute on function public.sync_preview_series_active(uuid, text, boolean, text, boolean) to service_role;
