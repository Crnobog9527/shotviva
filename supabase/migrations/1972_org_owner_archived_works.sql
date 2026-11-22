-- 企业作品 with the archive (1971): the owner's reads and deletes now cover works whose maker
-- deleted their account, shown as 「已注销成员」 (no creator id is kept). New functions rather than
-- changed ones: the code deployed before this keeps calling 1943's, whose rows never contain a
-- null maker, so it cannot choke on one. Service role only; the org is found from
-- orgs.owner_user_id = p_owner as in 1943.

-- An archived work's deletion has no maker to record.
alter table public.org_work_deletions alter column maker_user_id drop not null;

-- The makers to filter by: 1943's members, plus one row with a null user_id and status 'deleted'
-- for all archived works together, when there are any.
create function public.org_owner_work_makers(p_owner uuid)
returns table (user_id uuid, role text, status text, removed_at timestamptz, works integer)
language sql
stable
security definer
set search_path = ''
as $$
  with o as (select id from public.orgs where owner_user_id = p_owner)
  select * from (
    select m.user_id, m.role, m.status, m.removed_at, w.works
      from o
      join lateral (
        select j.user_id, count(*)::integer as works
          from public.generation_jobs j
         where j.org_id = o.id and j.status = 'succeeded' and j.deleted_at is null
         group by j.user_id
      ) w on true
      join public.org_members m on m.org_id = o.id and m.user_id = w.user_id
     order by (m.status = 'active') desc, w.works desc, m.user_id
     limit 200
  ) members
  union all
  select null::uuid, 'member', 'deleted', null::timestamptz, g.works
    from (select count(*)::integer as works
            from o join public.org_work_archive a on a.org_id = o.id
           where a.deleted_at is null
             and not exists (select 1 from public.generation_jobs j where j.id = a.job_id)) g
   where g.works > 0;
$$;

-- One page of the org's works, newest first: live ones (optionally one member's) and archived
-- ones (p_archived: only those). An archived work whose job still exists (an account deletion
-- that has not finished) is listed once, live. (created_at, id) cursor as in 1943.
create function public.org_owner_work_list(
  p_owner uuid,
  p_member uuid default null,
  p_archived boolean default false,
  p_limit integer default 30,
  p_before_at timestamptz default null,
  p_before_id uuid default null
)
returns table (id uuid, user_id uuid, template_id text, template_name text, created_at timestamptz,
               aspect_ratio text, member_active boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with o as (select id from public.orgs where owner_user_id = p_owner),
  works as (
    select j.id, j.user_id, j.template_id, j.created_at, j.inputs ->> 'aspect_ratio' as aspect_ratio,
           j.org_access_ended_at is null as member_active
      from o join public.generation_jobs j on j.org_id = o.id
     where j.status = 'succeeded' and j.deleted_at is null
       and not coalesce(p_archived, false) and (p_member is null or j.user_id = p_member)
    union all
    select a.job_id, null, a.template_id, a.made_at, a.aspect_ratio, false
      from o join public.org_work_archive a on a.org_id = o.id
     where a.deleted_at is null and p_member is null
       and not exists (select 1 from public.generation_jobs j where j.id = a.job_id)
  )
  select w.id, w.user_id, w.template_id, t.name, w.created_at, w.aspect_ratio, w.member_active
    from works w
    left join public.templates t on t.id = w.template_id
   where p_before_at is null or (w.created_at, w.id) < (p_before_at, p_before_id)
   order by w.created_at desc, w.id desc
   limit least(greatest(coalesce(p_limit, 30), 1), 60);
$$;

-- The file route's check (1943's org_owner_work) including archived works: user_id is null for
-- those and output_key is where the archive put the file.
create function public.org_owner_work_file(p_owner uuid, p_job_id uuid)
returns table (id uuid, user_id uuid, credit_pool text, output_key text)
language sql
stable
security definer
set search_path = ''
as $$
  select j.id, j.user_id, j.credit_pool, j.output_key
    from public.generation_jobs j
    join public.orgs o on o.id = j.org_id
   where j.id = p_job_id and o.owner_user_id = p_owner
     and j.status = 'succeeded' and j.deleted_at is null and j.output_key is not null
  union all
  select a.job_id, null, a.credit_pool, a.output_key
    from public.org_work_archive a
    join public.orgs o on o.id = a.org_id
   where a.job_id = p_job_id and o.owner_user_id = p_owner and a.deleted_at is null
     and not exists (select 1 from public.generation_jobs j where j.id = a.job_id);
$$;

-- The owner deletes an archived work (the live ones go through 1944's org_owner_delete_work).
-- Returns its file key for the server to remove; a repeat returns it again (one audit row);
-- anything else is JOB_NOT_FOUND.
create function public.org_owner_delete_archived_work(p_owner uuid, p_job_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.org_work_archive;
begin
  select a.* into v from public.org_work_archive a
    join public.orgs o on o.id = a.org_id
   where a.job_id = p_job_id and o.owner_user_id = p_owner
     and not exists (select 1 from public.generation_jobs j where j.id = a.job_id)
     for update of a;
  if not found then
    raise exception 'JOB_NOT_FOUND';
  end if;
  if v.deleted_at is null then
    update public.org_work_archive set deleted_at = now(), deleted_by = p_owner where job_id = p_job_id;
    insert into public.org_work_deletions (job_id, org_id, maker_user_id, deleted_by)
    values (p_job_id, v.org_id, null, p_owner)
    on conflict (job_id) do nothing;
  end if;
  return v.output_key;
end;
$$;

revoke execute on function public.org_owner_work_makers(uuid) from public, anon, authenticated;
revoke execute on function public.org_owner_work_list(uuid, uuid, boolean, integer, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function public.org_owner_work_file(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.org_owner_delete_archived_work(uuid, uuid) from public, anon, authenticated;
grant execute on function public.org_owner_work_makers(uuid) to service_role;
grant execute on function public.org_owner_work_list(uuid, uuid, boolean, integer, timestamptz, uuid) to service_role;
grant execute on function public.org_owner_work_file(uuid, uuid) to service_role;
grant execute on function public.org_owner_delete_archived_work(uuid, uuid) to service_role;
