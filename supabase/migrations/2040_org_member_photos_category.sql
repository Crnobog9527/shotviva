-- Photos' company view, by template category (Owner 2026-11-28; follows 2037 and 2039): a member
-- of an org whose workspace is on narrows the company's works to one root template category, on
-- top of "whose works".
--
-- Read-only, new functions only. 2037's org_member_photos and org_member_photos_count stay exactly
-- as they are (the code in production calls them, and the unfiltered company view keeps calling
-- them); nothing that exists changes: no table, no index, no policy, no grant.
--
-- Who reads what is 2037's rule, word for word, checked again on every call inside
-- org_member_photo_works: p_user is the signed-in account's own id from the session; the function
-- finds the org p_user holds an ACTIVE seat in whose status is 'active'; with none (no org, a
-- removed member, a workspace that is off) it returns nothing. The rows are the org's works (live
-- and archived) and p_user's own personal works, never another person's personal works. p_scope
-- and p_member narrow as in 2037: 'all', 'mine', 'member', 'archived', 'personal'.
--
-- A work's category is 2039's: its template's root category; an edit takes the category of the
-- work it was made from, up its maker's own chain of edits (own_photo_edit_root). An archived work
-- (a deleted account's) has its template only, so an archived edit stays in the built-in category.
-- Service role only.

-- 2037's set of works for p_user, each with its root category. The seat check lives here, so both
-- readers below run it on every call.
create function public.org_member_photo_works(p_user uuid, p_scope text default 'all', p_member uuid default null)
returns table (id uuid, user_id uuid, org_work boolean, archived boolean, template_id text,
               created_at timestamptz, aspect_ratio text, member_active boolean, category_key text)
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
  select j.id, j.user_id, true, false, j.template_id, j.created_at,
         j.inputs ->> 'aspect_ratio', j.org_access_ended_at is null,
         case when j.parent_job_id is null then t.category_key
              else public.own_photo_edit_root(j.user_id, j.template_id, j.parent_job_id) end
    from seat
    join public.generation_jobs j on j.org_id = seat.org_id
    join public.templates t on t.id = j.template_id
   where j.status = 'succeeded' and j.deleted_at is null
     and (p_scope = 'all'
          or (p_scope = 'mine' and j.user_id = p_user)
          or (p_scope = 'member' and p_member is not null and j.user_id = p_member))
  union all
  select a.job_id, null::uuid, true, true, a.template_id, a.made_at, a.aspect_ratio, false, t.category_key
    from seat
    join public.org_work_archive a on a.org_id = seat.org_id
    join public.templates t on t.id = a.template_id
   where a.deleted_at is null and p_scope in ('all', 'archived')
     and not exists (select 1 from public.generation_jobs j where j.id = a.job_id)
  union all
  select j.id, j.user_id, false, false, j.template_id, j.created_at, j.inputs ->> 'aspect_ratio', true,
         case when j.parent_job_id is null then t.category_key
              else public.own_photo_edit_root(j.user_id, j.template_id, j.parent_job_id) end
    from seat
    cross join public.generation_jobs j
    join public.templates t on t.id = j.template_id
   where j.user_id = p_user and j.org_id is null
     and j.status = 'succeeded' and j.deleted_at is null
     and p_scope in ('all', 'personal');
$$;

-- org_member_photos (2037) narrowed to one category: the same columns, order, cursors and cap.
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
  with picked as (
    select w.*
      from public.org_member_photo_works(p_user, p_scope, p_member) w
     where w.category_key = p_category
       and (p_before_at is null or (w.created_at, w.id) < (p_before_at, p_before_id))
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

-- The category chips for that view and scope: each category with works in it, and how many.
-- Built-in categories come too (is_system); the page offers no chip for those.
create function public.org_member_photo_categories(p_user uuid, p_scope text default 'all', p_member uuid default null)
returns table (category_key text, name_en text, name_zh text, sort_order integer, is_system boolean, works integer)
language sql
stable
security definer
set search_path = ''
as $$
  select c.key, c.name_en, c.name_zh, c.sort_order, c.is_system, count(*)::integer
    from public.org_member_photo_works(p_user, p_scope, p_member) w
    join public.template_categories c on c.key = w.category_key
   group by c.key, c.name_en, c.name_zh, c.sort_order, c.is_system
   order by c.sort_order, c.key;
$$;

revoke execute on function public.org_member_photo_works(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.org_member_photos_in_category(uuid, text, text, uuid, integer, timestamptz, uuid, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function public.org_member_photo_categories(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.org_member_photo_works(uuid, text, uuid) to service_role;
grant execute on function public.org_member_photos_in_category(uuid, text, text, uuid, integer, timestamptz, uuid, timestamptz, uuid) to service_role;
grant execute on function public.org_member_photo_categories(uuid, text, uuid) to service_role;
