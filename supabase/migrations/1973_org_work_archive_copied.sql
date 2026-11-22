-- Account deletion's archive (1971), at scale (control 2026-11-23): an account with many org
-- works is archived twice per deletion (before and after cancelling subscriptions), so a work
-- whose files are already copied is not handed out again. copied_at is set by the server once the
-- result (and a free work's protected small copy) is in org-works/<org_id>/.
--
-- Expand-only: a nullable column, a new function, and 1971's archive_org_works recreated with the
-- one filter `a.copied_at is null` and an order on what it returns (same signature).

alter table public.org_work_archive add column copied_at timestamptz;

-- The server marks the works it copied for p_user_id's deletion; ids of other accounts' or
-- non-archived works are ignored.
create function public.mark_org_works_copied(p_user_id uuid, p_job_ids uuid[])
returns integer
language sql
security definer
set search_path = ''
as $$
  with done as (
    update public.org_work_archive a set copied_at = now()
      from public.generation_jobs j
     where a.job_id = any(p_job_ids) and j.id = a.job_id and j.user_id = p_user_id
       and a.reason = 'account_deleted' and a.copied_at is null
    returning 1
  )
  select count(*)::integer from done;
$$;

revoke execute on function public.mark_org_works_copied(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.mark_org_works_copied(uuid, uuid[]) to service_role;

-- 1971's body; only the returned rows change: those not copied yet, oldest first (a stable order,
-- so chunks and retries walk them the same way).
create or replace function public.archive_org_works(p_user_id uuid)
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
       and j.status = 'succeeded' and j.deleted_at is null and a.copied_at is null
     order by a.made_at, a.job_id;
end;
$$;
