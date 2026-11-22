-- 企业作品 for every active member of the org (Owner 2026-11-23): the owner and the staff all see
-- all of the org's works, filter them by maker, view and download them. Deleting stays the owner's
-- (1944 / 1972 unchanged). New functions rather than changed ones, so the code deployed before
-- this keeps calling 1972's.
--
-- p_user is the signed-in account's own id from the session. The org is the one it is an active
-- member of (the owner has its own 'owner' row in org_members), found on every call, so a member
-- who is removed loses access at once. A suspended org's members keep read access: suspension
-- stops spending and joining, and the works stay the org's either way. The rows are exactly what
-- the owner's functions return for that org, in the same order. Service role only.

create function public.org_member_work_makers(p_user uuid)
returns table (user_id uuid, role text, status text, removed_at timestamptz, works integer)
language sql
stable
security definer
set search_path = ''
as $$
  select w.user_id, w.role, w.status, w.removed_at, w.works
    from public.org_members m
    join public.orgs o on o.id = m.org_id
   cross join lateral public.org_owner_work_makers(o.owner_user_id) with ordinality w
   where m.user_id = p_user and m.status = 'active'
   order by w.ordinality;
$$;

create function public.org_member_work_list(
  p_user uuid,
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
  select w.id, w.user_id, w.template_id, w.template_name, w.created_at, w.aspect_ratio, w.member_active
    from public.org_members m
    join public.orgs o on o.id = m.org_id
   cross join lateral public.org_owner_work_list(o.owner_user_id, p_member, p_archived, p_limit, p_before_at, p_before_id) with ordinality w
   where m.user_id = p_user and m.status = 'active'
   order by w.ordinality;
$$;

create function public.org_member_work_file(p_user uuid, p_job_id uuid)
returns table (id uuid, user_id uuid, credit_pool text, output_key text, archive_key text)
language sql
stable
security definer
set search_path = ''
as $$
  select w.id, w.user_id, w.credit_pool, w.output_key, w.archive_key
    from public.org_members m
    join public.orgs o on o.id = m.org_id
   cross join lateral public.org_owner_work_file(o.owner_user_id, p_job_id) w
   where m.user_id = p_user and m.status = 'active';
$$;

revoke execute on function public.org_member_work_makers(uuid) from public, anon, authenticated;
revoke execute on function public.org_member_work_list(uuid, uuid, boolean, integer, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function public.org_member_work_file(uuid, uuid) from public, anon, authenticated;
grant execute on function public.org_member_work_makers(uuid) to service_role;
grant execute on function public.org_member_work_list(uuid, uuid, boolean, integer, timestamptz, uuid) to service_role;
grant execute on function public.org_member_work_file(uuid, uuid) to service_role;
