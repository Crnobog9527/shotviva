-- 企业作品 (1941): deleting. An org work belongs to the org (Owner 2026-11-22), so only the org's
-- current owner deletes one, any member's included, and every such delete leaves an audit row.
-- Deleting also removes the work's files (core/jobs/delete-work.ts), so a member wiping company
-- works before leaving is exactly what this prevents.

-- One row per deleted org work: which org, who made it, who deleted it. Private like the other org
-- tables (RLS on, no policy, service role reads). No foreign key to the job or the accounts, so the
-- record outlives an account deletion.
create table public.org_work_deletions (
  job_id uuid primary key,
  org_id uuid not null references public.orgs (id),
  maker_user_id uuid not null,
  deleted_by uuid not null,
  created_at timestamptz not null default now()
);
alter table public.org_work_deletions enable row level security;
revoke all on table public.org_work_deletions from public, anon, authenticated;
grant select on table public.org_work_deletions to service_role;
create index org_work_deletions_org_idx on public.org_work_deletions (org_id, created_at desc);

-- The shared step: mark the work deleted (as 0340 does) and write the audit row, once.
create function public._org_work_mark_deleted(p_job public.generation_jobs, p_actor uuid)
returns public.generation_jobs
language plpgsql security definer set search_path = '' as $$
declare
  v_job public.generation_jobs;
begin
  update public.generation_jobs
     set deleted_at = now(), inputs = inputs - 'note' - 'copy' - 'instruction'
   where id = p_job.id
  returning * into v_job;
  insert into public.org_work_deletions (job_id, org_id, maker_user_id, deleted_by)
  values (p_job.id, p_job.org_id, p_job.user_id, p_actor)
  on conflict (job_id) do nothing;
  return v_job;
end $$;
revoke all on function public._org_work_mark_deleted(public.generation_jobs, uuid) from public, anon, authenticated, service_role;

-- 0340's body, plus: a work its maker can no longer reach (left the org) is missing, and an org
-- work is ORG_WORK_DELETE_FORBIDDEN unless the caller owns that org now (an owner deleting their
-- own org work from Photos; audited the same way).
create or replace function public.delete_own_job(p_job_id uuid, p_user_id uuid)
returns public.generation_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.generation_jobs;
begin
  select * into v_job from public.generation_jobs
   where id = p_job_id and user_id = p_user_id and org_access_ended_at is null
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
  if v_job.org_id is not null then
    if not exists (select 1 from public.orgs o where o.id = v_job.org_id and o.owner_user_id = p_user_id) then
      raise exception 'ORG_WORK_DELETE_FORBIDDEN';
    end if;
    return public._org_work_mark_deleted(v_job, p_user_id);
  end if;

  update public.generation_jobs
     set deleted_at = now(), inputs = inputs - 'note' - 'copy' - 'instruction'
   where id = p_job_id
  returning * into v_job;
  return v_job;
end;
$$;

-- The owner deletes one of the org's works from 企业作品. Anything that is not a work of the org
-- they own is JOB_NOT_FOUND; a running one JOB_RUNNING; a repeat returns the deleted row (one
-- audit row). Returns the row so the server removes its files, as for delete_own_job.
create function public.org_owner_delete_work(p_owner uuid, p_job_id uuid)
returns public.generation_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.generation_jobs;
begin
  select j.* into v_job from public.generation_jobs j
    join public.orgs o on o.id = j.org_id
   where j.id = p_job_id and o.owner_user_id = p_owner
     for update of j;
  if not found then
    raise exception 'JOB_NOT_FOUND';
  end if;
  if v_job.deleted_at is not null then
    return v_job;
  end if;
  if v_job.status = 'running' then
    raise exception 'JOB_RUNNING';
  end if;
  return public._org_work_mark_deleted(v_job, p_owner);
end;
$$;

revoke execute on function public.org_owner_delete_work(uuid, uuid) from public, anon, authenticated;
grant execute on function public.org_owner_delete_work(uuid, uuid) to service_role;
