-- T82 (ARCHITECTURE §6.3 「拒付申诉证据」): reserve_credits also records the IP of the website
-- request that starts a generation or edit (generation_jobs.client_ip, 0722), in the same insert
-- as the job, so the dispute evidence can show each work's time and IP.
--
-- Why drop and recreate (AGENTS §5 allows it when the signature must change): the IP has to
-- reach the insert, and adding a parameter with create or replace would leave the 11-argument
-- version behind as an overload that PostgREST could not tell apart from this one. The new
-- parameter defaults to null, so a caller that does not send it (older code during a deploy)
-- still resolves to this function by name. The body is otherwise the current one (0262).
drop function public.reserve_credits(uuid, uuid, text, text, integer, text, jsonb, text, text, text, uuid);

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
  p_visibility text default null,
  p_parent_job_id uuid default null,
  p_client_ip inet default null
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
  -- The `edit` template is only for edits, and an edit only runs on it.
  if (p_template_id = 'edit') <> (p_parent_job_id is not null) then
    raise exception 'INVALID_INPUT' using detail = 'an edit runs on the edit template with a parent job';
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

  -- Someone else's work, a failed, running or deleted one, or a missing one all look the same.
  if p_parent_job_id is not null then
    perform 1 from public.generation_jobs
     where id = p_parent_job_id and user_id = p_user_id and status = 'succeeded' and deleted_at is null;
    if not found then
      raise exception 'PARENT_JOB_NOT_FOUND';
    end if;
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
     credit_pool, visibility, credits_cost, parent_job_id, client_ip)
  values
    (p_job_id, p_user_id, p_module, p_template_id,
     coalesce(p_inputs, '{}'::jsonb) || jsonb_build_object('resolution', v_resolution),
     p_provider, p_source,
     p_idempotency_key,
     v_pool,
     -- Free works are always public (ARCHITECTURE §9); paid works default to private.
     case when v_pool = 'paid' then coalesce(p_visibility, 'private') else 'public' end,
     v_cost,
     p_parent_job_id,
     -- Only a website request's IP is the buyer's; a partner call comes from Graylum's server.
     case when p_source = 'web' then p_client_ip end)
  returning * into v_job;

  return v_job;
end;
$$;

revoke execute on function public.reserve_credits(uuid, uuid, text, text, integer, text, jsonb, text, text, text, uuid, inet)
  from public, anon, authenticated;
grant execute on function public.reserve_credits(uuid, uuid, text, text, integer, text, jsonb, text, text, text, uuid, inet)
  to service_role;
