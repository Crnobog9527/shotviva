-- T14: generation settlement with two pools (ARCHITECTURE §4, §6.1, §6.2). Replaces
-- reserve_credits / refund_job from 0024 (same signatures; they now return credit_pool)
-- and adds set_job_visibility. confirm_job moves no credits and is unchanged.

-- Paid pool first, then the free pool, whole order from one pool, never split:
--   paid credits cover the cost -> charge paid, credit_pool 'paid', visibility p_visibility
--                                  (default 'private')
--   else free credits cover it  -> charge free, credit_pool 'free', visibility forced 'public'
--   else                        -> CREDITS_INSUFFICIENT, nothing charged
create or replace function public.reserve_credits(
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
  v_pool text;
begin
  if p_credits_cost is null or p_credits_cost <= 0 then
    raise exception 'INVALID_INPUT' using detail = 'credits_cost must be positive';
  end if;

  -- Lock the profile first so concurrent reserves for one user run one at a time: the pool
  -- choice below always sees the balances the previous reserve left.
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

  if v_profile.credits >= p_credits_cost then
    v_pool := 'paid';
  elsif v_profile.free_credits >= p_credits_cost then
    v_pool := 'free';
  else
    raise exception 'CREDITS_INSUFFICIENT';
  end if;

  perform public._apply_credit_change(
    p_user_id, v_pool, 'reserve', -p_credits_cost, 'generation reserve',
    'job:' || p_job_id::text || ':reserve', p_job_id
  );

  insert into public.generation_jobs
    (id, user_id, module, template_id, inputs, provider, source, idempotency_key,
     credit_pool, visibility, credits_cost)
  values
    (p_job_id, p_user_id, p_module, p_template_id, coalesce(p_inputs, '{}'::jsonb), p_provider, p_source,
     p_idempotency_key,
     v_pool,
     -- Free works are always public (ARCHITECTURE §9); paid works default to private.
     case when v_pool = 'paid' then coalesce(p_visibility, 'private') else 'public' end,
     p_credits_cost)
  returning * into v_job;

  return v_job;
end;
$$;

-- Refunds go back to the pool the job was charged from.
create or replace function public.refund_job(p_job_id uuid, p_error_code text)
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
     set status = 'failed', error_code = coalesce(nullif(p_error_code, ''), 'UNKNOWN'), finished_at = now()
   where id = p_job_id
  returning * into v_job;
  return v_job;
end;
$$;

-- The owner's public/private toggle (ARCHITECTURE §6.2, §9). Paid works switch freely;
-- a free work can never be made private (FREE_WORK_PUBLIC). Someone else's job answers
-- JOB_NOT_FOUND, like a missing one. The table check generation_jobs_free_work_public
-- backs the same rule.
create function public.set_job_visibility(p_job_id uuid, p_user_id uuid, p_visibility text)
returns public.generation_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.generation_jobs;
begin
  if p_visibility is null or p_visibility not in ('public', 'private') then
    raise exception 'INVALID_INPUT' using detail = 'visibility must be public or private';
  end if;

  select * into v_job from public.generation_jobs
   where id = p_job_id and user_id = p_user_id
     for update;
  if not found then
    raise exception 'JOB_NOT_FOUND';
  end if;

  if v_job.credit_pool = 'free' and p_visibility = 'private' then
    raise exception 'FREE_WORK_PUBLIC';
  end if;

  update public.generation_jobs set visibility = p_visibility where id = p_job_id
  returning * into v_job;
  return v_job;
end;
$$;

revoke execute on function public.set_job_visibility(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.set_job_visibility(uuid, uuid, text) to service_role;
