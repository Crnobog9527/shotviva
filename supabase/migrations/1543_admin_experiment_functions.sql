-- /admin/experiments writes (1540–1542). Each action is one call, checks the actor is an admin, and
-- writes its admin_audit_log row in the same transaction. Expand-only: the audit action list is
-- widened (every value accepted before still is, through 1500's series_sync_delete).
-- Option ids are checked against the code's list before these are called (core/experiments); the
-- database only checks their shape.

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
  'series_delete','series_sync_delete',
  'experiment_save','experiment_start','experiment_pause','experiment_resume','experiment_end',
  'experiment_archive_variant','experiment_delete'));

create function admin.require_experiment_admin(p_actor uuid) returns void
language plpgsql stable set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'admin' and banned_at is null) then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
end $$;
revoke all on function admin.require_experiment_admin(uuid) from public, anon, authenticated, service_role;

-- Create a draft, or rewrite a draft's name, goal and variants. p_variants:
-- [{ option_id, label, weight, is_control }], 2–4 of them, one control, options distinct.
-- A started experiment cannot be edited: its variants have people on them.
create function public.admin_experiment_save(p_actor uuid, p_id bigint, p_surface text, p_name text, p_goal text, p_variants jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint;
begin
  perform admin.require_experiment_admin(p_actor);
  if jsonb_typeof(p_variants) is distinct from 'array' or jsonb_array_length(p_variants) not between 2 and 4
     or (select count(*) from jsonb_array_elements(p_variants) v where (v->>'is_control')::boolean) <> 1
     or (select count(distinct v->>'option_id') from jsonb_array_elements(p_variants) v) <> jsonb_array_length(p_variants) then
    raise exception 'EXPERIMENT_VARIANTS_INVALID' using errcode = '23514';
  end if;
  if p_id is null then
    insert into public.experiments (surface, name, goal, created_by) values (p_surface, p_name, p_goal, p_actor) returning id into v_id;
  else
    update public.experiments set name = p_name, goal = p_goal, updated_at = now()
    where id = p_id and status = 'draft' and surface = p_surface returning id into v_id;
    if v_id is null then raise exception 'EXPERIMENT_NOT_DRAFT'; end if;
    delete from public.experiment_variants where experiment_id = v_id;
  end if;
  insert into public.experiment_variants (experiment_id, option_id, label, weight, is_control)
  select v_id, v->>'option_id', v->>'label', (v->>'weight')::integer, (v->>'is_control')::boolean
  from jsonb_array_elements(p_variants) v;
  insert into public.admin_audit_log (action, user_id, reason, target_id)
  values ('experiment_save', p_actor, format('%s: %s', p_surface, p_name), v_id::text);
  return v_id;
end $$;
revoke all on function public.admin_experiment_save(uuid, bigint, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.admin_experiment_save(uuid, bigint, text, text, text, jsonb) to service_role;

-- start (draft → running), pause (running → paused), resume (paused → running),
-- end (running/paused → ended; p_variant = the winner, the control when null),
-- archive (p_variant, its people moved to p_fallback or the control), delete (drafts only).
-- A second live experiment on a surface fails on experiments_live_surface_idx (23505).
create function public.admin_experiment_act(p_actor uuid, p_id bigint, p_action text, p_variant bigint default null, p_fallback bigint default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_exp public.experiments;
  v_control bigint;
  v_target bigint;
  v_moved integer := 0;
begin
  perform admin.require_experiment_admin(p_actor);
  select * into v_exp from public.experiments where id = p_id for update;
  if not found then raise exception 'EXPERIMENT_NOT_FOUND'; end if;
  select id into v_control from public.experiment_variants where experiment_id = p_id and is_control;
  if p_action = 'start' and v_exp.status = 'draft' then
    if (select coalesce(sum(weight), 0) from public.experiment_variants where experiment_id = p_id) = 0 then
      raise exception 'EXPERIMENT_NO_WEIGHT' using errcode = '23514';
    end if;
    update public.experiments set status = 'running', started_at = now(), updated_at = now() where id = p_id;
  elsif p_action = 'pause' and v_exp.status = 'running' then
    update public.experiments set status = 'paused', updated_at = now() where id = p_id;
  elsif p_action = 'resume' and v_exp.status = 'paused' then
    update public.experiments set status = 'running', updated_at = now() where id = p_id;
  elsif p_action = 'end' and v_exp.status in ('running', 'paused') then
    v_target := coalesce(p_variant, v_control);
    if not exists (select 1 from public.experiment_variants where id = v_target and experiment_id = p_id and archived_at is null) then
      raise exception 'EXPERIMENT_VARIANT_INVALID';
    end if;
    update public.experiments set status = 'ended', ended_at = now(), winner_variant_id = v_target, updated_at = now() where id = p_id;
  elsif p_action = 'archive' and v_exp.status in ('running', 'paused') then
    v_target := coalesce(p_fallback, v_control);
    if p_variant = v_control or p_variant = v_target
       or not exists (select 1 from public.experiment_variants where id = p_variant and experiment_id = p_id and archived_at is null)
       or not exists (select 1 from public.experiment_variants where id = v_target and experiment_id = p_id and archived_at is null) then
      raise exception 'EXPERIMENT_VARIANT_INVALID';
    end if;
    update public.experiment_variants set archived_at = now(), fallback_variant_id = v_target where id = p_variant;
    update public.experiment_assignments
    set current_variant_id = v_target, reassigned_from = p_variant, reassigned_at = now()
    where current_variant_id = p_variant and experiment_id = p_id;
    get diagnostics v_moved = row_count;
    update public.experiments set updated_at = now() where id = p_id;
  elsif p_action = 'delete' and v_exp.status = 'draft' then
    delete from public.experiments where id = p_id;
  else
    raise exception 'EXPERIMENT_BAD_STATE';
  end if;
  insert into public.admin_audit_log (action, user_id, reason, target_id)
  values (
    case p_action when 'archive' then 'experiment_archive_variant' else 'experiment_' || p_action end,
    p_actor,
    case p_action
      when 'end' then format('%s: winner variant %s', v_exp.name, v_target)
      when 'archive' then format('%s: variant %s archived, %s accounts moved to %s', v_exp.name, p_variant, v_moved, v_target)
      else v_exp.name end,
    p_id::text);
end $$;
revoke all on function public.admin_experiment_act(uuid, bigint, text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.admin_experiment_act(uuid, bigint, text, bigint, bigint) to service_role;
