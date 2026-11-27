-- 企业作品 (1941), the owner's side: the workbench's 「企业作品」 view lists the org's works by
-- member, removed members included, and its file route signs one of them. Service role only; the
-- server passes the signed-in user and the functions find the org they own (orgs.owner_user_id),
-- so nobody else's works can be named. A suspended org's owner still sees its works. Deleted and
-- unfinished works are left out. Read-only.

-- The members who made org works, newest first: active ones (and the owner) first, then removed
-- ones, each with how many finished works they made. One query over generation_jobs_org_works_idx.
create function public.org_owner_work_members(p_owner uuid)
returns table (user_id uuid, role text, status text, removed_at timestamptz, works integer)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, m.role, m.status, m.removed_at, w.works
    from public.orgs o
    join lateral (
      select j.user_id, count(*)::integer as works
        from public.generation_jobs j
       where j.org_id = o.id and j.status = 'succeeded' and j.deleted_at is null
       group by j.user_id
    ) w on true
    join public.org_members m on m.org_id = o.id and m.user_id = w.user_id
   where o.owner_user_id = p_owner
   order by (m.status = 'active') desc, w.works desc, m.user_id
   limit 200;
$$;

-- One page of the org's finished works, newest first, optionally one member's, with the
-- (created_at, id) cursor (AGENTS §5.1 第 4 条) on generation_jobs_org_works_idx or
-- generation_jobs_org_member_works_idx.
create function public.org_owner_works(
  p_owner uuid,
  p_member uuid default null,
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
  select j.id, j.user_id, j.template_id, t.name, j.created_at, j.inputs ->> 'aspect_ratio',
         j.org_access_ended_at is null
    from public.orgs o
    join public.generation_jobs j on j.org_id = o.id
    left join public.templates t on t.id = j.template_id
   where o.owner_user_id = p_owner
     and j.status = 'succeeded' and j.deleted_at is null
     and (p_member is null or j.user_id = p_member)
     and (p_before_at is null or (j.created_at, j.id) < (p_before_at, p_before_id))
   order by j.created_at desc, j.id desc
   limit least(greatest(coalesce(p_limit, 30), 1), 60);
$$;

-- The file route's check: the work, when it is a finished org work of the org p_owner owns.
-- Primary key lookup. null otherwise, which the route answers with the same 404 as a missing work.
create function public.org_owner_work(p_owner uuid, p_job_id uuid)
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
     and j.status = 'succeeded' and j.deleted_at is null and j.output_key is not null;
$$;

revoke execute on function public.org_owner_work_members(uuid) from public, anon, authenticated;
revoke execute on function public.org_owner_works(uuid, uuid, integer, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function public.org_owner_work(uuid, uuid) from public, anon, authenticated;
grant execute on function public.org_owner_work_members(uuid) to service_role;
grant execute on function public.org_owner_works(uuid, uuid, integer, timestamptz, uuid) to service_role;
grant execute on function public.org_owner_work(uuid, uuid) to service_role;
