-- T16: reserve_credits charges templates.credits_cost[resolution], read here in the database,
-- instead of trusting the cost the caller passes (ARCHITECTURE §4 step 1). The resolution is
-- the job's own inputs.resolution ('1k' / '2k' / '3k'; absent means '1k', the partner route's
-- fixed tier), and it is stored back on the job so inputs always say what was charged.
--
-- create or replace keeps the signature (AGENTS §5: no drop and recreate), so p_credits_cost
-- stays as a parameter but is ignored; callers pass null. Everything else is unchanged from
-- 0004_generation_jobs.sql: profile lock, replay by job id or idempotency key, ban check, paid
-- pool first, free pool second, the whole order from one pool.

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
  v_resolution text := coalesce(p_inputs ->> 'resolution', '1k');
  v_cost integer;
begin
  if v_resolution not in ('1k', '2k', '3k') then
    raise exception 'INVALID_INPUT' using detail = 'resolution must be 1k, 2k or 3k';
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

  select (t.credits_cost ->> v_resolution)::integer into v_cost
    from public.templates t
   where t.id = p_template_id;
  if not found then
    raise exception 'TEMPLATE_NOT_FOUND';
  end if;

  if v_profile.credits >= v_cost then
    v_pool := 'paid';
  elsif v_profile.free_credits >= v_cost then
    v_pool := 'free';
  else
    raise exception 'CREDITS_INSUFFICIENT';
  end if;

  perform public._apply_credit_change(
    p_user_id, v_pool, 'reserve', -v_cost, 'generation reserve',
    'job:' || p_job_id::text || ':reserve', p_job_id
  );

  insert into public.generation_jobs
    (id, user_id, module, template_id, inputs, provider, source, idempotency_key,
     credit_pool, visibility, credits_cost)
  values
    (p_job_id, p_user_id, p_module, p_template_id,
     coalesce(p_inputs, '{}'::jsonb) || jsonb_build_object('resolution', v_resolution),
     p_provider, p_source,
     p_idempotency_key,
     v_pool,
     -- Free works are always public (ARCHITECTURE §9); paid works default to private.
     case when v_pool = 'paid' then coalesce(p_visibility, 'private') else 'public' end,
     v_cost)
  returning * into v_job;

  return v_job;
end;
$$;
