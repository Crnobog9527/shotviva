-- T30: reserve_credits takes photo edits (ARCHITECTURE §5.2). An edit is one ordinary generation
-- on the built-in template `edit`, charged templates.credits_cost[resolution] from the usual
-- pools; p_parent_job_id names the work being edited, which must be the caller's own succeeded
-- work, and is stored on the new job.
--
-- Why drop and recreate (AGENTS §5 allows it only when the signature must change): the new
-- argument changes the signature, and `create or replace` with one more argument would add a
-- second overload next to the old one instead of replacing it. Callers use named arguments
-- (supabase-js rpc), so every existing call works unchanged; the grants are restated below.
-- The body is 0023_reserve_credits_by_resolution.sql's, plus the parent check and column.

drop function public.reserve_credits(uuid, uuid, text, text, integer, text, jsonb, text, text, text);

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
  p_parent_job_id uuid default null
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

  -- Someone else's work, a failed or running one, or a missing one all look the same.
  if p_parent_job_id is not null then
    perform 1 from public.generation_jobs
     where id = p_parent_job_id and user_id = p_user_id and status = 'succeeded';
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
     credit_pool, visibility, credits_cost, parent_job_id)
  values
    (p_job_id, p_user_id, p_module, p_template_id,
     coalesce(p_inputs, '{}'::jsonb) || jsonb_build_object('resolution', v_resolution),
     p_provider, p_source,
     p_idempotency_key,
     v_pool,
     -- Free works are always public (ARCHITECTURE §9); paid works default to private.
     case when v_pool = 'paid' then coalesce(p_visibility, 'private') else 'public' end,
     v_cost,
     p_parent_job_id)
  returning * into v_job;

  return v_job;
end;
$$;

revoke execute on function public.reserve_credits(uuid, uuid, text, text, integer, text, jsonb, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_credits(uuid, uuid, text, text, integer, text, jsonb, text, text, text, uuid)
  to service_role;
