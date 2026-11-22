-- 企业作品 (1941) and account deletion (control 2026-11-22): deleting an account never takes
-- the org's works with it. generation_jobs.user_id cascades from auth.users, and account deletion
-- removes outputs/<user>/ from R2, so before that the works move into the org's own archive: a row
-- keyed to the org with no creator id, and the files copied under org-works/<org_id>/. The owner
-- keeps seeing them in 企业作品 as 「已注销成员」. Personal works keep today's behaviour.
--
-- The archive row is also the record of what happened (archived_at, reason). A work deleted in
-- 企业作品 later sets deleted_at / deleted_by here and leaves a row in org_work_deletions (1972).
--
-- Expand-only: a new table, two functions and a BEFORE DELETE trigger that only ever adds rows
-- here; deletes of generation_jobs go on as before.

create table public.org_work_archive (
  job_id uuid primary key,
  org_id uuid not null references public.orgs (id),
  template_id text not null,
  credit_pool text not null check (credit_pool in ('free', 'paid')),
  aspect_ratio text,
  -- Where the result is now: org-works/<org_id>/<job_id>.<ext> once copied by account deletion,
  -- or the original outputs/ key when the job was deleted some other way (the trigger below).
  output_key text not null,
  made_at timestamptz not null,
  archived_at timestamptz not null default now(),
  reason text not null default 'account_deleted' check (reason in ('account_deleted', 'job_deleted')),
  deleted_at timestamptz,
  deleted_by uuid,
  check ((deleted_at is null) = (deleted_by is null))
);
alter table public.org_work_archive enable row level security;
revoke all on table public.org_work_archive from public, anon, authenticated;
grant select on table public.org_work_archive to service_role;
create index org_work_archive_org_idx on public.org_work_archive (org_id, made_at desc, job_id desc)
  where deleted_at is null;

-- Step one of deleting an account (core/auth/account-deletion.ts), before anything else: archive
-- every finished, undeleted org work of p_user_id (whether or not they are still a member) and
-- return each with the key to copy it from and to. A repeat after a failed copy returns the same
-- pairs, so the retry copies again; no work or file is deleted here.
create function public.archive_org_works(p_user_id uuid)
returns table (job_id uuid, credit_pool text, source_key text, archive_key text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  -- An org's primary admin cannot go: orgs.owner_user_id would block deleting the account after
  -- its files were gone. Refused before anything happens; the org's admin is changed first.
  if exists (select 1 from public.orgs o where o.owner_user_id = p_user_id) then
    raise exception 'ORG_OWNER_CANNOT_DELETE_ACCOUNT';
  end if;
  -- An org work still being made would land in outputs/<user>/ after its copy was taken. A row
  -- left running past the sweeper's day (sweep_stale_generation_jobs) is dead and not waited for.
  if exists (select 1 from public.generation_jobs j where j.user_id = p_user_id and j.org_id is not null
              and j.status = 'running' and j.created_at > now() - interval '24 hours') then
    raise exception 'JOB_RUNNING';
  end if;
  -- A row from an earlier, unfinished try whose work has since been deleted is dropped.
  delete from public.org_work_archive a
   using public.generation_jobs j
   where j.id = a.job_id and j.user_id = p_user_id and a.reason = 'account_deleted' and a.deleted_at is null
     and (j.deleted_at is not null or j.status <> 'succeeded');
  -- No creator id outlives the account, the audit of earlier deletes included.
  update public.org_work_deletions set maker_user_id = null where maker_user_id = p_user_id;
  insert into public.org_work_archive (job_id, org_id, template_id, credit_pool, aspect_ratio, output_key, made_at, reason)
  select j.id, j.org_id, j.template_id, j.credit_pool, j.inputs ->> 'aspect_ratio',
         'org-works/' || j.org_id::text || '/' || j.id::text || coalesce(substring(j.output_key from '\.[a-z0-9]{2,5}$'), '.png'),
         j.created_at, 'account_deleted'
    from public.generation_jobs j
   where j.user_id = p_user_id and j.org_id is not null and j.status = 'succeeded' and j.deleted_at is null
     and j.output_key is not null
  on conflict (job_id) do nothing;
  return query
    select a.job_id, a.credit_pool, j.output_key, a.output_key
      from public.org_work_archive a
      join public.generation_jobs j on j.id = a.job_id
     where j.user_id = p_user_id and a.reason = 'account_deleted' and a.deleted_at is null
       and j.status = 'succeeded' and j.deleted_at is null;
end;
$$;

-- The guarantee under every path (an account removed from the Auth dashboard, any future delete):
-- an org work's row is never lost without an archive row. Without the copy step its files stay at
-- the original key, so output_key keeps that.
create function public._org_work_keep_on_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.org_id is not null and old.status = 'succeeded' and old.deleted_at is null and old.output_key is not null then
    insert into public.org_work_archive (job_id, org_id, template_id, credit_pool, aspect_ratio, output_key, made_at, reason)
    values (old.id, old.org_id, old.template_id, old.credit_pool, old.inputs ->> 'aspect_ratio', old.output_key,
            old.created_at, 'job_deleted')
    on conflict (job_id) do nothing;
  end if;
  return old;
end $$;

create trigger generation_jobs_org_work_keep
before delete on public.generation_jobs
for each row execute function public._org_work_keep_on_delete();

revoke all on function public._org_work_keep_on_delete() from public, anon, authenticated, service_role;
revoke execute on function public.archive_org_works(uuid) from public, anon, authenticated;
grant execute on function public.archive_org_works(uuid) to service_role;

-- 1944's shared delete step, plus: an archive row taken by an unfinished account deletion goes
-- with the work, so it never comes back in 企业作品 once the account is gone.
create or replace function public._org_work_mark_deleted(p_job public.generation_jobs, p_actor uuid)
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
  update public.org_work_archive set deleted_at = now(), deleted_by = p_actor
   where job_id = p_job.id and deleted_at is null;
  return v_job;
end $$;
