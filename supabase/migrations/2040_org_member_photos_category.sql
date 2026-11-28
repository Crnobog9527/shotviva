-- Photos' company view, by template category (Owner 2026-11-28; follows 2037 and 2039): a member
-- of an org whose workspace is on narrows the company's works to one root template category, on
-- top of "whose works".
--
-- Read-only, new functions only. 2037's org_member_photos and org_member_photos_count stay exactly
-- as they are (the code in production calls them, and the unfiltered company view keeps calling
-- them); nothing that exists changes: no table, no index, no policy, no grant.
--
-- Who reads what is 2037's rule, word for word, and each function below checks it again on every
-- call: p_user is the signed-in account's own id from the session; `seat` is the org p_user holds
-- an ACTIVE seat in whose status is 'active'; with none (no org, a removed member, a workspace
-- that is off) every branch reads nothing. The rows are the org's works (live and archived) and
-- p_user's own personal works, never another person's personal works. p_scope and p_member narrow
-- as in 2037: 'all', 'mine', 'member', 'archived', 'personal'.
--
-- A work's category is 2039's: its template's root category; an edit takes the category of the
-- work it was made from, up its maker's own chain of edits (own_photo_edit_root). An archived work
-- (a deleted account's) has its template only, so an archived edit stays in the built-in category.
-- Service role only.
--
-- Cost (ARCHITECTURE §8.3: the cursor and the limit go into the function). These are not inlined
-- (search_path is set), so the page function reads one page itself: one branch per source and per
-- direction, each with the seat, the scope, the category, the cursor and its own
-- "order by created_at, id ... limit", so each walks its index from the cursor and stops at
-- p_limit matches. The page down and the window up are separate branches (no CASE in the order).
-- At most p_limit rows per branch are then merged and cut to p_limit.
-- The personal branches order the tie on the id's text (collate "C": the same order as the uuid,
-- both compare the hex left to right). That keeps the planner off generation_jobs_created_at_id_idx
-- (every account's works by time), which matches "created_at, id" exactly and would read other
-- people's rows until it met enough of p_user's; with it out, the branch walks
-- generation_jobs_user_id_created_at_idx (user_id, created_at) and sorts the ties.

-- org_member_photos (2037) narrowed to one category: the same columns, order, cursors and cap.
-- p_before_*: the page older than the cursor. p_from_*: everything from the cursor up to the
-- newest, read oldest first so a capped read keeps the rows nearest the cursor.
create function public.org_member_photos_in_category(
  p_user uuid,
  p_category text,
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
  -- The page below the cursor (or the first page), newest first.
  down as (
    select w.* from (
    -- the org's works, everyone's (generation_jobs_org_works_idx)
    (select j.id, j.user_id, true as org_work, false as archived, j.template_id, j.created_at,
            j.inputs ->> 'aspect_ratio' as aspect_ratio, j.org_access_ended_at is null as member_active
       from public.generation_jobs j
       join public.templates t on t.id = j.template_id
      where p_scope = 'all'
        and j.org_id = (select org_id from seat)
        and j.status = 'succeeded' and j.deleted_at is null
        and case when j.parent_job_id is null then t.category_key
                      else public.own_photo_edit_root(j.user_id, j.template_id, j.parent_job_id) end = p_category
        and j.created_at <= coalesce(p_before_at, 'infinity'::timestamptz)
        and (p_before_at is null or (j.created_at, j.id) < (p_before_at, p_before_id))
      order by j.created_at desc, j.id desc
      limit least(greatest(coalesce(p_limit, 48), 1), 1000))
    union all
    -- the org's works of one maker (generation_jobs_org_member_works_idx)
    (select j.id, j.user_id, true, false, j.template_id, j.created_at, j.inputs ->> 'aspect_ratio', j.org_access_ended_at is null
       from public.generation_jobs j
       join public.templates t on t.id = j.template_id
      where p_scope in ('mine', 'member')
        and j.org_id = (select org_id from seat)
        and j.user_id = case p_scope when 'mine' then p_user else p_member end
        and j.status = 'succeeded' and j.deleted_at is null
        and case when j.parent_job_id is null then t.category_key
                      else public.own_photo_edit_root(j.user_id, j.template_id, j.parent_job_id) end = p_category
        and j.created_at <= coalesce(p_before_at, 'infinity'::timestamptz)
        and (p_before_at is null or (j.created_at, j.id) < (p_before_at, p_before_id))
      order by j.created_at desc, j.id desc
      limit least(greatest(coalesce(p_limit, 48), 1), 1000))
    union all
    -- deleted accounts' archived works (org_work_archive_org_idx)
    (select a.job_id, null::uuid, true, true, a.template_id, a.made_at, a.aspect_ratio, false
       from public.org_work_archive a
       join public.templates t on t.id = a.template_id
      where p_scope in ('all', 'archived')
        and a.org_id = (select org_id from seat)
        and a.deleted_at is null
        and not exists (select 1 from public.generation_jobs j where j.id = a.job_id)
        and t.category_key = p_category
        and a.made_at <= coalesce(p_before_at, 'infinity'::timestamptz)
        and (p_before_at is null or (a.made_at, a.job_id) < (p_before_at, p_before_id))
      order by a.made_at desc, a.job_id desc
      limit least(greatest(coalesce(p_limit, 48), 1), 1000))
    union all
    -- p_user's own personal works (generation_jobs_user_id_created_at_idx)
    (select j.id, j.user_id, false, false, j.template_id, j.created_at, j.inputs ->> 'aspect_ratio', true
       from public.generation_jobs j
       join public.templates t on t.id = j.template_id
      where p_scope in ('all', 'personal')
        and exists (select 1 from seat)
        and j.user_id = p_user and j.org_id is null
        and j.status = 'succeeded' and j.deleted_at is null
        and case when j.parent_job_id is null then t.category_key
                      else public.own_photo_edit_root(j.user_id, j.template_id, j.parent_job_id) end = p_category
        and j.created_at <= coalesce(p_before_at, 'infinity'::timestamptz)
        and (p_before_at is null or (j.created_at, j.id) < (p_before_at, p_before_id))
      order by j.created_at desc, (j.id::text collate "C") desc
      limit least(greatest(coalesce(p_limit, 48), 1), 1000))
    ) w (id, user_id, org_work, archived, template_id, created_at, aspect_ratio, member_active)
    where p_from_at is null
    order by w.created_at desc, w.id desc
    limit least(greatest(coalesce(p_limit, 48), 1), 1000)
  ),
  -- The window from the cursor up to the newest, nearest the cursor first.
  up as (
    select w.* from (
    -- the org's works, everyone's (generation_jobs_org_works_idx)
    (select j.id, j.user_id, true as org_work, false as archived, j.template_id, j.created_at,
            j.inputs ->> 'aspect_ratio' as aspect_ratio, j.org_access_ended_at is null as member_active
       from public.generation_jobs j
       join public.templates t on t.id = j.template_id
      where p_scope = 'all'
        and j.org_id = (select org_id from seat)
        and j.status = 'succeeded' and j.deleted_at is null
        and case when j.parent_job_id is null then t.category_key
                      else public.own_photo_edit_root(j.user_id, j.template_id, j.parent_job_id) end = p_category
        and j.created_at >= p_from_at
        and (j.created_at, j.id) >= (p_from_at, p_from_id)
      order by j.created_at asc, j.id asc
      limit least(greatest(coalesce(p_limit, 48), 1), 1000))
    union all
    -- the org's works of one maker (generation_jobs_org_member_works_idx)
    (select j.id, j.user_id, true, false, j.template_id, j.created_at, j.inputs ->> 'aspect_ratio', j.org_access_ended_at is null
       from public.generation_jobs j
       join public.templates t on t.id = j.template_id
      where p_scope in ('mine', 'member')
        and j.org_id = (select org_id from seat)
        and j.user_id = case p_scope when 'mine' then p_user else p_member end
        and j.status = 'succeeded' and j.deleted_at is null
        and case when j.parent_job_id is null then t.category_key
                      else public.own_photo_edit_root(j.user_id, j.template_id, j.parent_job_id) end = p_category
        and j.created_at >= p_from_at
        and (j.created_at, j.id) >= (p_from_at, p_from_id)
      order by j.created_at asc, j.id asc
      limit least(greatest(coalesce(p_limit, 48), 1), 1000))
    union all
    -- deleted accounts' archived works (org_work_archive_org_idx)
    (select a.job_id, null::uuid, true, true, a.template_id, a.made_at, a.aspect_ratio, false
       from public.org_work_archive a
       join public.templates t on t.id = a.template_id
      where p_scope in ('all', 'archived')
        and a.org_id = (select org_id from seat)
        and a.deleted_at is null
        and not exists (select 1 from public.generation_jobs j where j.id = a.job_id)
        and t.category_key = p_category
        and a.made_at >= p_from_at
        and (a.made_at, a.job_id) >= (p_from_at, p_from_id)
      order by a.made_at asc, a.job_id asc
      limit least(greatest(coalesce(p_limit, 48), 1), 1000))
    union all
    -- p_user's own personal works (generation_jobs_user_id_created_at_idx)
    (select j.id, j.user_id, false, false, j.template_id, j.created_at, j.inputs ->> 'aspect_ratio', true
       from public.generation_jobs j
       join public.templates t on t.id = j.template_id
      where p_scope in ('all', 'personal')
        and exists (select 1 from seat)
        and j.user_id = p_user and j.org_id is null
        and j.status = 'succeeded' and j.deleted_at is null
        and case when j.parent_job_id is null then t.category_key
                      else public.own_photo_edit_root(j.user_id, j.template_id, j.parent_job_id) end = p_category
        and j.created_at >= p_from_at
        and (j.created_at, j.id) >= (p_from_at, p_from_id)
      order by j.created_at asc, (j.id::text collate "C") asc
      limit least(greatest(coalesce(p_limit, 48), 1), 1000))
    ) w (id, user_id, org_work, archived, template_id, created_at, aspect_ratio, member_active)
    where p_from_at is not null
    order by w.created_at asc, w.id asc
    limit least(greatest(coalesce(p_limit, 48), 1), 1000)
  )
  select p.id, p.user_id, p.org_work, p.archived, p.template_id, t.name, p.created_at, p.aspect_ratio, p.member_active
    from (select * from down union all select * from up) p
    left join public.templates t on t.id = p.template_id
   order by p.created_at desc, p.id desc;
$$;

-- The category chips for that view and scope: each category with works in it, and how many, in
-- one aggregate over the scope's works. Built-in categories come too (is_system); the page offers
-- no chip for those. The page asks for it on the first screen only, never on Load more.
create function public.org_member_photo_categories(p_user uuid, p_scope text default 'all', p_member uuid default null)
returns table (category_key text, name_en text, name_zh text, sort_order integer, is_system boolean, works integer)
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
    select case when j.parent_job_id is null then t.category_key
                      else public.own_photo_edit_root(j.user_id, j.template_id, j.parent_job_id) end as category_key
      from public.generation_jobs j
      join public.templates t on t.id = j.template_id
     where j.org_id = (select org_id from seat)
       and j.status = 'succeeded' and j.deleted_at is null
       and (p_scope = 'all'
            or (p_scope = 'mine' and j.user_id = p_user)
            or (p_scope = 'member' and p_member is not null and j.user_id = p_member))
    union all
    select t.category_key
      from public.org_work_archive a
      join public.templates t on t.id = a.template_id
     where a.org_id = (select org_id from seat)
       and a.deleted_at is null and p_scope in ('all', 'archived')
       and not exists (select 1 from public.generation_jobs j where j.id = a.job_id)
    union all
    select case when j.parent_job_id is null then t.category_key
                      else public.own_photo_edit_root(j.user_id, j.template_id, j.parent_job_id) end
      from public.generation_jobs j
      join public.templates t on t.id = j.template_id
     where exists (select 1 from seat)
       and j.user_id = p_user and j.org_id is null
       and j.status = 'succeeded' and j.deleted_at is null
       and p_scope in ('all', 'personal')
  )
  select c.key, c.name_en, c.name_zh, c.sort_order, c.is_system, count(*)::integer
    from works w
    join public.template_categories c on c.key = w.category_key
   group by c.key, c.name_en, c.name_zh, c.sort_order, c.is_system
   order by c.sort_order, c.key;
$$;

revoke execute on function public.org_member_photos_in_category(uuid, text, text, uuid, integer, timestamptz, uuid, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function public.org_member_photo_categories(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.org_member_photos_in_category(uuid, text, text, uuid, integer, timestamptz, uuid, timestamptz, uuid) to service_role;
grant execute on function public.org_member_photo_categories(uuid, text, uuid) to service_role;
