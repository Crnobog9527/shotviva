-- `pnpm templates:apply` (Owner 2026-11-12): a local batch file creates and edits templates,
-- categories and series without clicking through the admin. Nothing here is a new rule. Each step
-- calls the function the admin page calls for the same change, or makes the same row update the
-- admin server code makes (common cover columns after an upload, the 上架 switch). The script
-- builds every argument with the admin's own TypeScript validation first.
--
-- One call is one transaction, all or nothing. Each item (a category, a template, a series) runs
-- in its own subtransaction only so that every failing item is reported with its error code in
-- one pass; if any item failed, or with p_validate_only (--dry-run), the whole batch is rolled
-- back at the end: the same functions run against the same rows and nothing is kept.
--
-- Deferred checks (the publish floor, sale and style-reference triggers are DEFERRABLE INITIALLY
-- DEFERRED) are forced at the end of every item, so a dry run reports them and a real run fails on
-- the item that caused them instead of at commit. Publishing, unpublishing and cover changes are
-- audited in admin_audit_log like the sync's (1273); the actions are allowed by 1275.
--
-- Errors: only our own upper-case codes and their details (written by our functions, never row
-- data) are returned; anything else is reported as DB_ERROR with its SQLSTATE and constraint
-- name. A failing row's detail could otherwise echo a private prompt.

-- service_role may read admin_audit_log but not write it; audit rows go through definer functions
-- (as _affiliate_audit). This one writes only the two templates:apply actions, and only for a
-- service-role request (PostgREST's SET ROLE) or the database owner.
create or replace function admin.template_apply_audit(p_actor uuid, p_action text, p_target text, p_reason text) returns void
    language plpgsql
    security definer
    set search_path to ''
    as $$
begin
  if coalesce(current_setting('role', true), 'none') <> 'service_role' and session_user <> 'postgres' then
    raise exception 'FORBIDDEN';
  end if;
  if p_action not in ('template_apply_active', 'template_apply_cover') then raise exception 'INVALID_INPUT'; end if;
  insert into public.admin_audit_log(action, user_id, target_id, reason) values(p_action, p_actor, p_target, p_reason);
end $$;

create or replace function admin.apply_template_step(p_actor uuid, p_step jsonb) returns void
    language plpgsql
    set search_path to ''
    as $$
declare
  v_id text := p_step->>'id';
  v_active boolean;
  v_assignment jsonb;
  v_series uuid;
  v_row public.template_series;
begin
  case p_step->>'op'
  when 'save_category' then
    perform public.admin_save_template_category(p_step->'category', (p_step->>'is_new')::boolean, p_actor);
  when 'move_category' then
    perform public.admin_move_template_category(p_step->>'key', p_step->>'from_parent', p_step->>'parent', p_step->>'before', p_actor);
  when 'save_reference_category' then
    perform public.admin_save_reference_category(p_actor, p_step->>'key', p_step->>'name_en', p_step->>'name_zh',
      p_step->>'parent', (p_step->>'is_new')::boolean);
  when 'move_reference_category' then
    perform public.admin_move_reference_category(p_actor, p_step->>'key', p_step->>'from_parent', p_step->>'parent', p_step->>'before');
  when 'save_template' then
    v_assignment := p_step->'assignment';
    -- A series named by slug, which may have been created earlier in this batch.
    if p_step ? 'series_slug' then
      select s.id into v_series from public.template_series s where s.slug = p_step->>'series_slug';
      if v_series is null then raise exception 'SERIES_NOT_FOUND'; end if;
      v_assignment := jsonb_set(v_assignment, '{series_id}', to_jsonb(v_series));
    end if;
    -- An absent style_refs key is SQL null: the stored references stay, as in the editor.
    perform public.admin_save_template_assignment(p_actor, p_step->'template', p_step->'prompt', v_assignment,
      (p_step->>'is_new')::boolean, (p_step->>'expected')::integer, null, p_step->'style_refs');
  when 'set_cover' then
    -- What applyCover writes once the converted files are in the public bucket.
    update public.templates t set
      cover_before_url = case when p_step ? 'before' then p_step->>'before' else t.cover_before_url end,
      cover_after_url = case when p_step ? 'after' then p_step->>'after' else t.cover_after_url end
      where t.id = v_id;
    if not found then raise exception 'TEMPLATE_NOT_FOUND'; end if;
    perform admin.template_apply_audit(p_actor, 'template_apply_cover', v_id, 'templates:apply: cover');
  when 'test_run_cover' then
    -- 「设为封面」 on a trial run of this template, never of another one.
    if not exists(select from public.admin_test_runs r where r.id = (p_step->>'run_id')::uuid and r.template_id = v_id) then
      raise exception 'TEST_RUN_NOT_FOUND';
    end if;
    perform public.admin_set_test_run_cover(p_actor, (p_step->>'run_id')::uuid, p_step->>'before', p_step->>'after', null);
    perform admin.template_apply_audit(p_actor, 'template_apply_cover', v_id, 'templates:apply: cover from trial run ' || (p_step->>'run_id'));
  when 'set_sale' then
    perform public.admin_set_template_sale(p_actor, v_id, (p_step->>'enabled')::boolean);
  when 'set_active' then
    -- The 上架 switch's update (setTemplatesActive); the table's triggers re-check the floor.
    v_active := (p_step->>'active')::boolean;
    if v_active is null then raise exception 'INVALID_INPUT'; end if;
    -- Unpublishing needs a reason, as on the admin page.
    if not v_active and nullif(btrim(p_step->>'reason'), '') is null then raise exception 'UNPUBLISH_REASON_REQUIRED'; end if;
    update public.templates t set is_active = v_active,
      featured_rank = case when v_active then t.featured_rank end
      where t.id = v_id;
    if not found then raise exception 'TEMPLATE_NOT_FOUND'; end if;
    perform admin.template_apply_audit(p_actor, 'template_apply_active', v_id,
      'templates:apply: ' || case when v_active then 'published' else 'unpublished: ' || btrim(p_step->>'reason') end);
  when 'save_series' then
    -- The file is the source of truth for a series it names (by slug): the revision is the row's
    -- own, read under the series lock in the admin function's lock order, so a save earlier in
    -- this batch (a member joining or leaving) is not mistaken for another admin's edit.
    perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.category_tree',0));
    perform pg_advisory_xact_lock(hashtextextended('shotviva.template_series',0));
    select * into v_row from public.template_series s where s.slug = p_step->'fields'->>'slug';
    perform public.admin_save_template_series(v_row.id, case when v_row.id is not null then admin.template_series_revision(v_row) end,
      p_step->'fields',
      case when p_step ? 'members' then array(select jsonb_array_elements_text(p_step->'members'))
        else array(select t.id from public.templates t where t.series_id = v_row.id order by t.series_sort_order, t.id) end,
      p_actor, p_step->>'reason');
  else
    raise exception 'INVALID_INPUT';
  end case;
end $$;

create or replace function public.admin_apply_template_batch(p_actor uuid, p_items jsonb, p_validate_only boolean)
    returns jsonb
    language plpgsql
    set search_path to ''
    as $$
declare
  results jsonb := '[]';
  item jsonb;
  step jsonb;
  v_message text;
  v_detail text;
  v_state text;
  v_constraint text;
  v_known boolean;
  v_failed boolean := false;
begin
  if not exists(select from public.profiles where id = p_actor and role = 'admin' and banned_at is null) then
    raise exception 'NOT_ADMIN';
  end if;
  if p_validate_only is null or jsonb_typeof(p_items) is distinct from 'array' then raise exception 'INVALID_INPUT'; end if;
  -- MAX_BATCH_ITEMS in scripts/template-apply/schema.ts.
  if jsonb_array_length(p_items) > 300 then raise exception 'BATCH_TOO_LARGE'; end if;
  begin
    for item in select value from jsonb_array_elements(p_items) loop
      begin
        set constraints all deferred;
        if jsonb_typeof(item->'ops') is distinct from 'array' then raise exception 'INVALID_INPUT'; end if;
        for step in select value from jsonb_array_elements(item->'ops') loop
          perform admin.apply_template_step(p_actor, step);
        end loop;
        -- Run this item's deferred checks now, so their failure is this item's (every deferrable
        -- constraint in the schema is INITIALLY DEFERRED, so `deferred` restores the default).
        set constraints all immediate;
        set constraints all deferred;
        results := results || jsonb_build_array(jsonb_build_object('ref', item->>'ref', 'ok', true));
      exception when others then
        get stacked diagnostics v_message = message_text, v_detail = pg_exception_detail,
          v_state = returned_sqlstate, v_constraint = constraint_name;
        v_known := v_message ~ '^[A-Z][A-Z0-9_]+$';
        v_failed := true;
        results := results || jsonb_build_array(jsonb_build_object('ref', item->>'ref', 'ok', false,
          'code', case when v_known then v_message else 'DB_ERROR' end,
          'detail', case when v_known then nullif(v_detail, '') end,
          'sqlstate', v_state, 'constraint', nullif(v_constraint, '')));
      end;
    end loop;
    -- A private SQLSTATE rolls back every item's changes; the results above are kept.
    if p_validate_only or v_failed then raise exception using errcode = 'Z9302'; end if;
  exception when sqlstate 'Z9302' then
    null;
  end;
  return results;
end $$;

revoke all on function admin.template_apply_audit(uuid, text, text, text) from public, anon, authenticated;
grant execute on function admin.template_apply_audit(uuid, text, text, text) to service_role;
revoke all on function admin.apply_template_step(uuid, jsonb) from public, anon, authenticated;
grant execute on function admin.apply_template_step(uuid, jsonb) to service_role;
revoke all on function public.admin_apply_template_batch(uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.admin_apply_template_batch(uuid, jsonb, boolean) to service_role;
