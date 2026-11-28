-- 作品页就是企业作品 (Owner 2026-11-28): while an org's enterprise workspace is on
-- (orgs.status = 'active'), every active member of it (the owner and the staff) sees the whole
-- company's works on their own Photos page, with their own personal works among them.
--
-- Read-only, new functions only: the code deployed before this never calls them, and nothing that
-- exists changes (no table, no policy, no grant, 1992's functions as they are).
--
-- p_user is the signed-in account's own id from the session. Every call finds, afresh, the org
-- p_user holds an ACTIVE seat in whose status is 'active'; with none (no org, a removed member, a
-- workspace that is off) the functions return nothing, so nobody outside that set reads another
-- person's work through them. The rows are:
--   * the org's works: live ones and archived ones (a deleted account's, maker unknown), exactly
--     the set org_owner_work_list returns for that org;
--   * p_user's own personal works (org_id is null): made before joining, or paid with their own
--     credits while the workspace was off (2034). Nobody else's personal works, ever.
-- Newest first on (created_at, id). p_scope narrows: 'all', 'mine' (p_user's own org works),
-- 'member' (p_member's org works), 'archived', 'personal'.
-- p_before_*: the page older than the cursor. p_from_*: everything from the cursor up to the
-- newest (Photos' Load more renders the list down to the last work shown, as listOwnJobs does);
-- those come oldest first, so a capped read keeps the rows nearest the cursor.
-- Service role only.

create function public.org_member_photos(
  p_user uuid,
  p_scope text default 'all',
  p_member uuid default null,
  p_limit integer default 48,
  p_before_at timestamptz default null,
  p_before_id uuid default null,
  p_from_at timestamptz default null,
  p_from_id uuid default null
)
returns table (id uuid, user_id uuid, org_work boolean, archived boolean, template_id text,
               template_name text, created_at timestamptz, aspect_ratio text, member_active boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with seat as (
    select o.id as org_id
      from public.org_members m
      join public.orgs o on o.id = m.org_id
     where m.user_id = p_user and m.status = 'active' and o.status = 'active'
     limit 1
  ),
  works as (
    select j.id, j.user_id, true as org_work, false as archived, j.template_id, j.created_at,
           j.inputs ->> 'aspect_ratio' as aspect_ratio, j.org_access_ended_at is null as member_active
      from seat join public.generation_jobs j on j.org_id = seat.org_id
     where j.status = 'succeeded' and j.deleted_at is null
       and (p_scope = 'all'
            or (p_scope = 'mine' and j.user_id = p_user)
            or (p_scope = 'member' and p_member is not null and j.user_id = p_member))
    union all
    select a.job_id, null::uuid, true, true, a.template_id, a.made_at, a.aspect_ratio, false
      from seat join public.org_work_archive a on a.org_id = seat.org_id
     where a.deleted_at is null and p_scope in ('all', 'archived')
       and not exists (select 1 from public.generation_jobs j where j.id = a.job_id)
    union all
    select j.id, j.user_id, false, false, j.template_id, j.created_at, j.inputs ->> 'aspect_ratio', true
      from seat cross join public.generation_jobs j
     where j.user_id = p_user and j.org_id is null
       and j.status = 'succeeded' and j.deleted_at is null
       and p_scope in ('all', 'personal')
  ),
  picked as (
    select w.*
      from works w
     where (p_before_at is null or (w.created_at, w.id) < (p_before_at, p_before_id))
       and (p_from_at is null or (w.created_at, w.id) >= (p_from_at, p_from_id))
     order by case when p_from_at is null then w.created_at end desc,
              case when p_from_at is null then w.id end desc,
              case when p_from_at is not null then w.created_at end asc,
              case when p_from_at is not null then w.id end asc
     limit least(greatest(coalesce(p_limit, 48), 1), 1000)
  )
  select p.id, p.user_id, p.org_work, p.archived, p.template_id, t.name, p.created_at, p.aspect_ratio, p.member_active
    from picked p
    left join public.templates t on t.id = p.template_id
   order by p.created_at desc, p.id desc;
$$;

-- How many works that view holds for the same scope: Photos' count and "N of M".
create function public.org_member_photos_count(p_user uuid, p_scope text default 'all', p_member uuid default null)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  with seat as (
    select o.id as org_id
      from public.org_members m
      join public.orgs o on o.id = m.org_id
     where m.user_id = p_user and m.status = 'active' and o.status = 'active'
     limit 1
  )
  select (
    (select count(*) from seat join public.generation_jobs j on j.org_id = seat.org_id
      where j.status = 'succeeded' and j.deleted_at is null
        and (p_scope = 'all'
             or (p_scope = 'mine' and j.user_id = p_user)
             or (p_scope = 'member' and p_member is not null and j.user_id = p_member)))
    + (select count(*) from seat join public.org_work_archive a on a.org_id = seat.org_id
        where a.deleted_at is null and p_scope in ('all', 'archived')
          and not exists (select 1 from public.generation_jobs j where j.id = a.job_id))
    + (select count(*) from seat cross join public.generation_jobs j
        where j.user_id = p_user and j.org_id is null
          and j.status = 'succeeded' and j.deleted_at is null
          and p_scope in ('all', 'personal'))
  )::integer;
$$;

revoke execute on function public.org_member_photos(uuid, text, uuid, integer, timestamptz, uuid, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function public.org_member_photos_count(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.org_member_photos(uuid, text, uuid, integer, timestamptz, uuid, timestamptz, uuid) to service_role;
grant execute on function public.org_member_photos_count(uuid, text, uuid) to service_role;
