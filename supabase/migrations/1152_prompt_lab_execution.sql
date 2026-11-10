create function public.admin_claim_prompt_lab_run(p_actor uuid,p_run_id uuid) returns boolean
language plpgsql set search_path='' as $$
begin
  perform admin.require_reference_admin(p_actor);
  -- A stale queued job must not call a provider on a later budget day.
  perform pg_advisory_xact_lock(hashtext('shotviva.admin_test_budget'));
  update public.prompt_lab_runs set status='running',claimed_at=clock_timestamp() where id=p_run_id and status='queued'
    and started_at>clock_timestamp()-interval '10 minutes'
    and (started_at at time zone 'Asia/Shanghai')::date=(clock_timestamp() at time zone 'Asia/Shanghai')::date;
  if not found then return false; end if;
  update public.admin_test_spend set counted_usd=estimate_usd where run_id=p_run_id;
  return true;
end $$;

create function public.admin_finish_prompt_lab_run(p_actor uuid,p_run_id uuid,p_status text,p_output_key text,p_error_code text,
  p_provider_usage jsonb,p_cost_usd numeric) returns void language plpgsql set search_path='' as $$
declare r public.prompt_lab_runs;
begin
  perform admin.require_reference_admin(p_actor);
  if p_status is null or p_status not in ('succeeded','failed') or (p_status='succeeded')<>(p_output_key is not null)
    or p_cost_usd<0 then raise exception 'INVALID_INPUT'; end if;
  select * into r from public.prompt_lab_runs where id=p_run_id for update;
  if not found then raise exception 'PROMPT_RUN_NOT_FOUND'; end if;
  if r.status in ('succeeded','failed') and r.error_code is distinct from 'TIMEOUT' then return; end if;
  if r.claimed_at is null then raise exception 'PROMPT_RUN_NOT_CLAIMED'; end if;
  update public.prompt_lab_runs set status=p_status,output_key=p_output_key,
    error_code=case when p_status='failed' then coalesce(p_error_code,'GENERATION_FAILED') end,
    cost_usd=p_cost_usd,finished_at=now() where id=p_run_id;
  update public.admin_test_spend set cost_usd=p_cost_usd,counted_usd=coalesce(p_cost_usd,
    case when p_status='failed' and p_error_code='PREPARE_FAILED' and not coalesce(p_provider_usage ?| array['output_tokens','completion_tokens','cost'],false) then 0 else estimate_usd end),
    has_openrouter=coalesce(p_provider_usage ?| array['cost','prompt_tokens','completion_tokens'],false),finished_at=now()
  where run_id=p_run_id;
end $$;

revoke all on function public.admin_claim_prompt_lab_run(uuid,uuid),public.admin_finish_prompt_lab_run(uuid,uuid,text,text,text,jsonb,numeric)
  from public,anon,authenticated;
grant execute on function public.admin_claim_prompt_lab_run(uuid,uuid),public.admin_finish_prompt_lab_run(uuid,uuid,text,text,text,jsonb,numeric)
  to service_role;
