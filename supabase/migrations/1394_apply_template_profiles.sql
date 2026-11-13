-- templates:apply (1260) writes provider profiles (1390–1391): `profiles.seedream` in a batch file
-- saves the profile that is not live without touching the live one, and `activeProfile` switches
-- through the admin's own switch (same checks, never unpublishes, audited). Two new step ops; the
-- function is otherwise as in 1260.

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
  when 'save_profile' then
    -- The profile that is not live (1391); the file is the source of truth, so the expected version
    -- is the row's own, read under the template lock the function takes.
    perform public.admin_save_template_profile(p_actor, v_id, p_step->>'profile', p_step->'prompt', p_step->>'quality',
      p_step->'credits_cost', array(select jsonb_array_elements_text(coalesce(p_step->'unpriced_resolutions','[]'::jsonb))),
      (select p.prompt_version from public.template_profiles p where p.template_id = v_id and p.profile = p_step->>'profile'));
  when 'switch_profile' then
    -- The admin's switch (1391), audited with the batch's reason.
    perform admin.switch_template_profile(p_actor, v_id, p_step->>'profile', 'templates:apply');
  else
    raise exception 'INVALID_INPUT';
  end case;
end $$;
