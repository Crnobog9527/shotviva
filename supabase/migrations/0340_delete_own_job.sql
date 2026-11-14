-- T41 (ARCHITECTURE §6.2「删除作品」): a user deletes their own finished work. Soft delete: the row
-- stays for the credit ledger, the real-cost reconciliation (T33) and admin stats; everything a
-- user can read leaves it out, and the server then deletes the work's R2 files.

alter table public.generation_jobs add column deleted_at timestamptz;

comment on column public.generation_jobs.deleted_at is
  'When the owner deleted this work (T41). Set only by delete_own_job; user-facing reads skip it.';

-- The owner's own reads (Photos, the support picker) skip deleted works. Still one flat
-- condition per row (AGENTS §5.1 item 7).
drop policy "generation_jobs_select_own" on public.generation_jobs;
create policy "generation_jobs_select_own" on public.generation_jobs
  for select to authenticated
  using ((select auth.uid()) = user_id and deleted_at is null);

-- One round trip (AGENTS §5.1): only the owner, only a finished job (succeeded or failed; a
-- running one would still settle). A repeat returns the row as it is. Someone else's job, or a
-- missing one, is JOB_NOT_FOUND. No credits move: what was spent stays spent.
-- What the user typed for the work (the note, the template's text fields, an edit's
-- instruction) goes with it; the row keeps only what the ledger, the cost reconciliation and the
-- admin stats read (template, resolution, pool, credits, cost, times) and the file keys, which
-- the server deletes next.
create function public.delete_own_job(p_job_id uuid, p_user_id uuid)
returns public.generation_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.generation_jobs;
begin
  select * into v_job from public.generation_jobs
   where id = p_job_id and user_id = p_user_id
     for update;
  if not found then
    raise exception 'JOB_NOT_FOUND';
  end if;
  if v_job.deleted_at is not null then
    return v_job;
  end if;
  if v_job.status = 'running' then
    raise exception 'JOB_RUNNING';
  end if;

  update public.generation_jobs
     set deleted_at = now(), inputs = inputs - 'note' - 'copy' - 'instruction'
   where id = p_job_id
  returning * into v_job;
  return v_job;
end;
$$;

revoke execute on function public.delete_own_job(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_own_job(uuid, uuid) to service_role;

-- The public/private toggle (0004) no longer reaches a deleted work. Body otherwise 0004's.
create or replace function public.set_job_visibility(p_job_id uuid, p_user_id uuid, p_visibility text)
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
   where id = p_job_id and user_id = p_user_id and deleted_at is null
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

-- An edit (T30) cannot start from a deleted work. Same signature as 0262, so `create or replace`
-- keeps its grants; the body is 0262's with `deleted_at is null` in the parent check.
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

-- Admin「查看作品」(T25, 0186, 0320) also says when the user deleted the work, so the page shows
-- 已删除 and signs nothing (the files are gone). The return type changes, so drop and recreate.
drop function public.admin_view_work(uuid);

create function public.admin_view_work(p_job_id uuid)
returns table (user_id uuid, status text, output_key text, input_key text, created_at timestamptz, deleted_at timestamptz)
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
    coalesce(v_job.inputs -> 'kept_inputs' ->> 0, v_job.inputs ->> 'input_key'), v_job.created_at, v_job.deleted_at;
end;
$$;

revoke execute on function public.admin_view_work(uuid) from public, anon, authenticated;
grant execute on function public.admin_view_work(uuid) to service_role;
