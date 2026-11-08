-- T85: starts an admin test run (ARCHITECTURE §10.b), before any model is called (the face-swap
-- judge and the edit-scope call included). One call: the admin check, the daily budget under a
-- lock (so the three requests of a ×3 batch cannot all slip under it together), the edit's parent
-- check, the run, its spend row (0782) holding the estimate, and the photo's last_used_at.
--
-- p_run_id comes from the browser; a repeat returns the existing row and starts nothing (the
-- caller sees status <> 'running' or a row it did not just create and does not call the model).
-- An edit (p_kind = 'edit') names a succeeded run of the same template with a result; it takes
-- that run's photo. Over the budget (spent today, 0783, plus p_estimate_usd) raises
-- TEST_BUDGET_EXCEEDED and nothing is written. Works on unpublished templates too.

create function public.admin_begin_test_run(
  p_actor uuid,
  p_run_id uuid,
  p_template_id text,
  p_kind text,
  p_parent_id uuid,
  p_photo_id uuid,
  p_batch_id uuid,
  p_resolution text,
  p_inputs jsonb,
  p_prompt_version integer,
  p_provider text,
  p_estimate_usd numeric
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_existing public.admin_test_runs;
  v_parent public.admin_test_runs;
  v_photo uuid := p_photo_id;
  v_status jsonb;
  v_row public.admin_test_runs;
begin
  if p_actor is null or p_run_id is null or p_batch_id is null then
    raise exception 'INVALID_INPUT' using detail = 'actor, run id and batch id are required';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_actor and p.role = 'admin') then
    raise exception 'NOT_ADMIN';
  end if;
  if p_kind is null or p_kind not in ('generate', 'edit') then
    raise exception 'INVALID_INPUT' using detail = 'kind must be generate or edit';
  end if;
  if p_estimate_usd is null or p_estimate_usd < 0 then
    raise exception 'INVALID_INPUT' using detail = 'estimate is required';
  end if;

  select * into v_existing from public.admin_test_runs r where r.id = p_run_id;
  if found then
    if v_existing.template_id <> p_template_id then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return to_jsonb(v_existing);
  end if;

  if not exists (select 1 from public.templates t where t.id = p_template_id) then
    raise exception 'TEMPLATE_NOT_FOUND';
  end if;

  if p_kind = 'edit' then
    select * into v_parent from public.admin_test_runs r
     where r.id = p_parent_id and r.template_id = p_template_id and r.status = 'succeeded' and r.output_key is not null;
    if not found then
      raise exception 'TEST_RUN_NOT_FOUND';
    end if;
    v_photo := v_parent.photo_id;
  elsif p_parent_id is not null then
    raise exception 'INVALID_INPUT' using detail = 'only an edit has a parent';
  elsif v_photo is not null and not exists (select 1 from public.admin_test_photos ph where ph.id = v_photo) then
    raise exception 'TEST_PHOTO_NOT_FOUND';
  end if;

  -- One budget decision at a time; held until commit, so the next request sees this row.
  perform pg_advisory_xact_lock(hashtext('shotviva.admin_test_budget'));
  v_status := public.admin_test_budget_status();
  if (v_status ->> 'spent_usd')::numeric + p_estimate_usd > (v_status ->> 'budget_usd')::numeric then
    raise exception 'TEST_BUDGET_EXCEEDED';
  end if;

  insert into public.admin_test_runs (
    id, template_id, kind, parent_id, photo_id, batch_id, resolution, inputs, prompt_version, provider, estimate_usd, created_by
  ) values (
    p_run_id, p_template_id, p_kind, p_parent_id, v_photo, p_batch_id, p_resolution, coalesce(p_inputs, '{}'::jsonb),
    p_prompt_version, p_provider, p_estimate_usd, p_actor
  )
  on conflict (id) do nothing
  returning * into v_row;

  if v_row.id is null then
    -- A concurrent request with the same id won; hand back its row.
    select * into v_row from public.admin_test_runs r where r.id = p_run_id;
    return to_jsonb(v_row);
  end if;

  insert into public.admin_test_spend (run_id, template_id, estimate_usd)
  values (p_run_id, p_template_id, p_estimate_usd);

  if v_photo is not null then
    update public.admin_test_photos set last_used_at = now() where id = v_photo;
  end if;
  return to_jsonb(v_row);
end;
$$;

revoke execute on function public.admin_begin_test_run(uuid, uuid, text, text, uuid, uuid, uuid, text, jsonb, integer, text, numeric) from public, anon, authenticated;
grant execute on function public.admin_begin_test_run(uuid, uuid, text, text, uuid, uuid, uuid, text, jsonb, integer, text, numeric) to service_role;
