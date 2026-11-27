-- reserve_batch_cell and claim_batch_zip read effective_limits() (ARCHITECTURE §6.5) instead of
-- effective_tier(), so an org's usage settings count. Same bodies as 1231 and 1232 otherwise; for
-- an account outside an org the result is unchanged (Max: up to 5 templates, Pro/Max: ZIP).
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
  if (p_inputs->>'batch_templates')::integer > 1
     and (p_inputs->>'batch_templates')::integer > (public.effective_limits(p_user_id)->>'multi_template_max')::integer then
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

create or replace function public.claim_batch_zip(p_user_id uuid, p_batch_id uuid, p_token uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  state admin.batch_zip_requests;
  at_time timestamptz;
  recent timestamptz[];
  active jsonb;
  result text := 'acquired';
begin
  if not (public.effective_limits(p_user_id)->>'batch_zip')::boolean then return 'upgrade'; end if;
  insert into admin.batch_zip_requests (user_id) values (p_user_id) on conflict do nothing;
  select * into strict state from admin.batch_zip_requests where user_id=p_user_id for update;
  at_time := clock_timestamp();
  recent := array(select t from unnest(state.request_times) t where t > at_time - interval '1 minute');
  if cardinality(recent) >= 3 then return 'limited'; end if;
  select coalesce(jsonb_object_agg(key,value), '{}') into active from jsonb_each(state.active_batches)
    where (value->>'expires')::timestamptz > at_time;
  if active ? p_batch_id::text then
    result := 'packing';
  else
    active := active || jsonb_build_object(p_batch_id::text,
      jsonb_build_object('token', p_token, 'expires', at_time + interval '6 minutes'));
  end if;
  update admin.batch_zip_requests set request_times = array_append(recent,at_time), active_batches = active where user_id=p_user_id;
  return result;
end;
$$;
revoke all on function public.claim_batch_zip(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_batch_zip(uuid,uuid,uuid) to service_role;
