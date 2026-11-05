-- Synchronous generation settlement (ARCHITECTURE §4): reserve up front, then exactly one
-- of confirm or refund. Every function is idempotent by job id.

create function public.reserve_credits(
  p_job_id uuid,
  p_user_id uuid,
  p_module text,
  p_template_id text,
  p_credits_cost integer,
  p_source text,
  p_inputs jsonb default '{}'::jsonb,
  p_provider text default null,
  p_idempotency_key text default null,
  p_visibility text default null
)
returns public.generation_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_job public.generation_jobs;
  v_paid boolean;
begin
  if p_credits_cost is null or p_credits_cost <= 0 then
    raise exception 'INVALID_INPUT' using detail = 'credits_cost must be positive';
  end if;

  -- Lock the profile first so concurrent reserves for one user run one at a time and
  -- a replayed job id or idempotency key always sees the row the first call wrote.
  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  select * into v_job from public.generation_jobs where id = p_job_id;
  if found then
    if v_job.user_id <> p_user_id then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return v_job;
  end if;

  if p_idempotency_key is not null then
    select * into v_job from public.generation_jobs
     where user_id = p_user_id and idempotency_key = p_idempotency_key;
    if found then
      return v_job;
    end if;
  end if;

  if v_profile.banned_at is not null then
    raise exception 'USER_BANNED';
  end if;

  v_paid := v_profile.paid_until is not null and v_profile.paid_until > now();

  perform public._apply_credit_change(
    p_user_id, 'reserve', -p_credits_cost, 'generation reserve',
    'job:' || p_job_id::text || ':reserve', p_job_id
  );

  insert into public.generation_jobs
    (id, user_id, module, template_id, inputs, provider, source, idempotency_key, visibility, credits_cost)
  values
    (p_job_id, p_user_id, p_module, p_template_id, coalesce(p_inputs, '{}'::jsonb), p_provider, p_source,
     p_idempotency_key,
     -- Free users' work is always public (ARCHITECTURE §9); paid users default to private.
     case when v_paid then coalesce(p_visibility, 'private') else 'public' end,
     p_credits_cost)
  returning * into v_job;

  return v_job;
end;
$$;

create function public.confirm_job(p_job_id uuid, p_output_key text)
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
     set status = 'succeeded', output_key = p_output_key, finished_at = now()
   where id = p_job_id
  returning * into v_job;
  return v_job;
end;
$$;

create function public.refund_job(p_job_id uuid, p_error_code text)
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
    v_user_id, 'refund', v_job.credits_cost, 'generation refund',
    'job:' || p_job_id::text || ':refund', p_job_id
  );

  update public.generation_jobs
     set status = 'failed', error_code = coalesce(nullif(p_error_code, ''), 'UNKNOWN'), finished_at = now()
   where id = p_job_id
  returning * into v_job;
  return v_job;
end;
$$;

revoke execute on function public.reserve_credits(uuid, uuid, text, text, integer, text, jsonb, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.confirm_job(uuid, text) from public, anon, authenticated;
revoke execute on function public.refund_job(uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_credits(uuid, uuid, text, text, integer, text, jsonb, text, text, text)
  to service_role;
grant execute on function public.confirm_job(uuid, text) to service_role;
grant execute on function public.refund_job(uuid, text) to service_role;
