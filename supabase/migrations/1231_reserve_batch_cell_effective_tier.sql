-- Same body as 1170 except the Max check reads effective_tier().
create or replace function public.reserve_batch_cell(
  p_job_id uuid, p_user_id uuid, p_module text, p_template_id text,
  p_credits_cost integer, p_inputs jsonb, p_provider text, p_visibility text
) returns public.generation_jobs language plpgsql security definer set search_path = '' as $$
declare
  job public.generation_jobs;
  batch uuid := (p_inputs->>'batch_id')::uuid;
  position_in_batch integer := (p_inputs->>'batch_position')::integer;
begin
  job := public.reserve_credits(p_job_id,p_user_id,p_module,p_template_id,p_credits_cost,'web',
    p_inputs,p_provider,null,p_visibility,null);
  if job.inputs->>'attempt_id' is distinct from p_inputs->>'attempt_id' then return job; end if;
  if job.credit_pool <> 'paid' then raise exception 'CREDITS_INSUFFICIENT'; end if;
  -- Legacy single-template batch clients do not have a preflight ID.
  if batch is null then return job; end if;
  if position_in_batch is null then raise exception 'INVALID_INPUT'; end if;
  if job.credits_cost is distinct from p_credits_cost then raise exception 'TEMPLATE_QUOTE_CHANGED'; end if;
  if (p_inputs->>'batch_templates')::integer > 1 and public.effective_tier(p_user_id) is distinct from 'max' then
    raise exception 'BATCH_MAX_REQUIRED';
  end if;
  if exists (
    select 1 from public.generation_jobs j where j.user_id=p_user_id and j.batch_id=batch
      and j.status<>'failed' and (j.inputs->>'batch_position')::integer=position_in_batch and j.id<>p_job_id
  ) then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  update public.generation_jobs set batch_id=batch where id=p_job_id returning * into job;
  return job;
end;
$$;
revoke all on function public.reserve_batch_cell(uuid,uuid,text,text,integer,jsonb,text,text) from public, anon, authenticated;
grant execute on function public.reserve_batch_cell(uuid,uuid,text,text,integer,jsonb,text,text) to service_role;
