-- T40 (ARCHITECTURE §8.3「输入图随作品保留」): while the result is written, the server copies the
-- job's uploads inside R2 to outputs/{user_id}/{job_id}-in-{n}.{ext}; confirm_job records those
-- keys in the job's existing inputs as kept_inputs, in the same call that settles it (AGENTS §5.1:
-- one round trip per business action). No new column: they belong to the inputs.
--
-- A key outside the job's own outputs/ slot is dropped rather than raised: a bad copy list must
-- never fail (and refund) a finished result. A repeat keeps the first settlement, as before.
--
-- The signature changes, so the 0281 version is dropped and recreated (an overload would make
-- calls without the new argument ambiguous). p_kept_inputs defaults to null, so existing callers
-- (stuck-job tooling, the QA scripts, tests) behave as before. Body otherwise that of 0281.

drop function public.confirm_job(uuid, text, jsonb, numeric);

create function public.confirm_job(
  p_job_id uuid,
  p_output_key text,
  p_provider_usage jsonb default null,
  p_cost_usd numeric default null,
  p_kept_inputs text[] default null
)
returns public.generation_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.generation_jobs;
  v_prefix text;
  v_kept text[];
begin
  select * into v_job from public.generation_jobs where id = p_job_id for update;
  if not found then
    raise exception 'JOB_NOT_FOUND';
  end if;
  -- A repeat keeps the first settlement, usage, cost and kept inputs included.
  if v_job.status = 'succeeded' then
    return v_job;
  end if;
  if v_job.status = 'failed' then
    raise exception 'JOB_ALREADY_SETTLED';
  end if;
  if p_output_key is null or length(p_output_key) = 0 then
    raise exception 'INVALID_INPUT' using detail = 'output_key is required';
  end if;

  v_prefix := 'outputs/' || v_job.user_id::text || '/' || v_job.id::text || '-in-';
  select array_agg(k order by n) into v_kept
    from unnest(coalesce(p_kept_inputs, '{}'::text[])) with ordinality as t(k, n)
   where n <= 30 and k is not null and left(k, length(v_prefix)) = v_prefix and k not like '%/../%';

  update public.generation_jobs
     set status = 'succeeded', output_key = p_output_key, finished_at = now(),
         provider_usage = p_provider_usage, cost_usd = p_cost_usd,
         inputs = case when v_kept is null then inputs else inputs || jsonb_build_object('kept_inputs', to_jsonb(v_kept)) end
   where id = p_job_id
  returning * into v_job;
  return v_job;
end;
$$;

revoke execute on function public.confirm_job(uuid, text, jsonb, numeric, text[]) from public, anon, authenticated;
grant execute on function public.confirm_job(uuid, text, jsonb, numeric, text[]) to service_role;

-- Admin「查看作品」(T25, 0186): the input link now points at the kept copy when the work has one,
-- so「已过期」only shows for works made before T40 (or whose copy failed). Same signature and
-- audit row as 0186; only the input_key column changes.
create or replace function public.admin_view_work(p_job_id uuid)
returns table (user_id uuid, status text, output_key text, input_key text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.generation_jobs;
begin
  select * into v_job from public.generation_jobs j where j.id = p_job_id;
  if not found then
    raise exception 'JOB_NOT_FOUND';
  end if;

  insert into public.admin_audit_log (action, user_id, target_id, reason)
  values ('view_work', v_job.user_id, p_job_id::text, '客服查看作品');

  return query select v_job.user_id, v_job.status, v_job.output_key,
    coalesce(v_job.inputs -> 'kept_inputs' ->> 0, v_job.inputs ->> 'input_key'), v_job.created_at;
end;
$$;
