-- T33: confirm_job and refund_job also record the provider's usage and the job's cost, in the
-- same call that settles it (AGENTS §5.1: one round trip per business action). A failed job
-- still records them when the provider reported usage: the provider bills it all the same.
--
-- The signature changes, so the two-argument versions are dropped and recreated rather than
-- overloaded (an overload would make two-argument calls ambiguous). The new parameters default
-- to null, so existing two-argument callers (stuck-job refunds, tests) behave as before.
-- Bodies are otherwise those of 0004.

drop function public.confirm_job(uuid, text);
drop function public.refund_job(uuid, text);

create function public.confirm_job(
  p_job_id uuid,
  p_output_key text,
  p_provider_usage jsonb default null,
  p_cost_usd numeric default null
)
returns public.generation_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.generation_jobs;
begin
  select * into v_job from public.generation_jobs where id = p_job_id for update;
  if not found then
    raise exception 'JOB_NOT_FOUND';
  end if;
  -- A repeat keeps the first settlement, usage and cost included.
  if v_job.status = 'succeeded' then
    return v_job;
  end if;
  if v_job.status = 'failed' then
    raise exception 'JOB_ALREADY_SETTLED';
  end if;
  if p_output_key is null or length(p_output_key) = 0 then
    raise exception 'INVALID_INPUT' using detail = 'output_key is required';
  end if;

  update public.generation_jobs
     set status = 'succeeded', output_key = p_output_key, finished_at = now(),
         provider_usage = p_provider_usage, cost_usd = p_cost_usd
   where id = p_job_id
  returning * into v_job;
  return v_job;
end;
$$;

create function public.refund_job(
  p_job_id uuid,
  p_error_code text,
  p_provider_usage jsonb default null,
  p_cost_usd numeric default null
)
returns public.generation_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_job public.generation_jobs;
begin
  select user_id into v_user_id from public.generation_jobs where id = p_job_id;
  if not found then
    raise exception 'JOB_NOT_FOUND';
  end if;

  -- Same lock order as reserve_credits (profile, then job) so the two cannot deadlock.
  perform 1 from public.profiles where id = v_user_id for update;
  select * into v_job from public.generation_jobs where id = p_job_id for update;

  if v_job.status = 'failed' then
    return v_job;
  end if;
  if v_job.status = 'succeeded' then
    raise exception 'JOB_ALREADY_SETTLED';
  end if;

  perform public._apply_credit_change(
    v_user_id, v_job.credit_pool, 'refund', v_job.credits_cost, 'generation refund',
    'job:' || p_job_id::text || ':refund', p_job_id
  );

  update public.generation_jobs
     set status = 'failed', error_code = coalesce(nullif(p_error_code, ''), 'UNKNOWN'), finished_at = now(),
         provider_usage = p_provider_usage, cost_usd = p_cost_usd
   where id = p_job_id
  returning * into v_job;
  return v_job;
end;
$$;

revoke execute on function public.confirm_job(uuid, text, jsonb, numeric) from public, anon, authenticated;
revoke execute on function public.refund_job(uuid, text, jsonb, numeric) from public, anon, authenticated;
grant execute on function public.confirm_job(uuid, text, jsonb, numeric) to service_role;
grant execute on function public.refund_job(uuid, text, jsonb, numeric) to service_role;
