-- Photos' category filter (作品页改版 PR③, Owner 2026-11-28): a person narrows their own finished
-- works to one root template category, or to the watermarked ones.
--
-- Read-only, new functions only: the code deployed before this never calls them, and nothing that
-- exists changes (no table, no index, no policy, no grant).
--
-- A work's category is its template's root (templates.category_key). An edit runs on a built-in
-- template (a system category, in no catalogue), so it takes the category of the work it was made
-- from, up the chain of edits; an edit whose original is gone keeps the built-in category and is
-- listed under "All" only. A deleted original still names the category (the row is kept).
--
-- p_user is the signed-in account's own id from the session. Every row is p_user's own finished,
-- undeleted work the personal Photos page already lists (listOwnJobs): nothing here reads another
-- person's work, and an ancestor is followed only while it is p_user's own.
-- security invoker, service role only: the server calls them with the service key, as it reads
-- generation_jobs for the same page.
--
-- Cost. These are not inlined (search_path is set), so the page function takes the cursor and the
-- limit itself, as org_member_photos does (2037): it walks generation_jobs_user_id_created_at_idx
-- (user_id, created_at desc) from the cursor and stops at p_limit matches. Only an edit pays the
-- walk up its chain; every other row's category is its template's, one primary-key lookup.

-- The root category of one edit: up from its parent while the template is a built-in one.
create function public.own_photo_edit_root(p_user uuid, p_template text, p_parent uuid)
returns text
language sql
stable
set search_path = ''
as $$
  with recursive up as (
    select p_template as template_id, p_parent as parent_job_id, 0 as depth
    union all
    select p.template_id, p.parent_job_id, u.depth + 1
      from up u
      join public.templates t on t.id = u.template_id
      join public.template_categories c on c.key = t.category_key and c.is_system
      join public.generation_jobs p on p.id = u.parent_job_id and p.user_id = p_user
     where u.depth < 30
  )
  select t.category_key
    from up u
    join public.templates t on t.id = u.template_id
   order by u.depth desc
   limit 1;
$$;

-- One page of the works under a filter, as generation_jobs rows (the page parses them as it does
-- the unfiltered list's). p_category: one root category. p_watermarked: only the works that carry
-- a watermark (paid from the free pool). Newest first on (created_at, id).
-- p_before_*: the page older than the cursor. p_from_*: everything from the cursor up to the
-- newest (Load more renders the list down to the last work shown); those come oldest first, so a
-- capped read keeps the rows nearest the cursor. p_batches: the photos of these batches only (a
-- batch the page cut is completed with its other photos the filter keeps); the cursor is ignored.
-- p_limit is capped at 1000.
-- Three branches, one per kind of read, each with its parameter test first: the function runs on
-- a generic plan, where "p_batches is null or batch_id = any (p_batches)" could not use an index.
-- The batch branch reads generation_jobs_batch_slot (user_id, batch_id), at most 30 rows a batch.
create function public.own_photos_filtered(
  p_user uuid,
  p_category text default null,
  p_watermarked boolean default false,
  p_limit integer default 49,
  p_before_at timestamptz default null,
  p_before_id uuid default null,
  p_from_at timestamptz default null,
  p_from_id uuid default null,
  p_batches uuid[] default null
)
returns setof public.generation_jobs
language sql
stable
set search_path = ''
as $$
  (select j.*
     from public.generation_jobs j
     join public.templates t on t.id = j.template_id
    where p_from_at is null and p_batches is null
      and j.user_id = p_user and j.status = 'succeeded'
      and j.deleted_at is null and j.org_access_ended_at is null
      and j.created_at <= coalesce(p_before_at, 'infinity'::timestamptz)
      and (p_before_at is null or (j.created_at, j.id) < (p_before_at, p_before_id))
      and (not coalesce(p_watermarked, false) or j.credit_pool = 'free')
      and (p_category is null
           or case when j.parent_job_id is null then t.category_key
                   else public.own_photo_edit_root(p_user, j.template_id, j.parent_job_id) end = p_category)
    order by j.created_at desc, j.id desc
    limit least(greatest(coalesce(p_limit, 49), 1), 1000))
  union all
  (select j.*
     from public.generation_jobs j
     join public.templates t on t.id = j.template_id
    where p_from_at is not null and p_batches is null
      and j.user_id = p_user and j.status = 'succeeded'
      and j.deleted_at is null and j.org_access_ended_at is null
      and j.created_at >= p_from_at
      and (j.created_at, j.id) >= (p_from_at, p_from_id)
      and (not coalesce(p_watermarked, false) or j.credit_pool = 'free')
      and (p_category is null
           or case when j.parent_job_id is null then t.category_key
                   else public.own_photo_edit_root(p_user, j.template_id, j.parent_job_id) end = p_category)
    order by j.created_at asc, j.id asc
    limit least(greatest(coalesce(p_limit, 49), 1), 1000))
  union all
  (select j.*
     from public.generation_jobs j
     join public.templates t on t.id = j.template_id
    where p_batches is not null
      and j.user_id = p_user and j.batch_id = any (p_batches) and j.status = 'succeeded'
      and j.deleted_at is null and j.org_access_ended_at is null
      and (not coalesce(p_watermarked, false) or j.credit_pool = 'free')
      and (p_category is null
           or case when j.parent_job_id is null then t.category_key
                   else public.own_photo_edit_root(p_user, j.template_id, j.parent_job_id) end = p_category)
    order by j.created_at desc, j.id desc
    limit least(greatest(coalesce(p_limit, 49), 1), 1000));
$$;

-- The filter's chips, one aggregate over p_user's finished works: each category they have works
-- in, with how many and how many of them carry a watermark. Built-in categories come too
-- (is_system), so the rows add up to every finished work; the page offers no chip for those.
-- Read for the personal page only (a company member's page never calls it).
create function public.own_photo_categories(p_user uuid)
returns table (category_key text, name_en text, name_zh text, sort_order integer, is_system boolean,
               works integer, watermarked integer)
language sql
stable
set search_path = ''
as $$
  select c.key, c.name_en, c.name_zh, c.sort_order, c.is_system,
         count(*)::integer, (count(*) filter (where r.credit_pool = 'free'))::integer
    from (
      select j.credit_pool,
             case when j.parent_job_id is null then t.category_key
                  else public.own_photo_edit_root(p_user, j.template_id, j.parent_job_id) end as category_key
        from public.generation_jobs j
        join public.templates t on t.id = j.template_id
       where j.user_id = p_user and j.status = 'succeeded'
         and j.deleted_at is null and j.org_access_ended_at is null
    ) r
    join public.template_categories c on c.key = r.category_key
   group by c.key, c.name_en, c.name_zh, c.sort_order, c.is_system
   order by c.sort_order, c.key;
$$;

revoke execute on function public.own_photo_edit_root(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.own_photos_filtered(uuid, text, boolean, integer, timestamptz, uuid, timestamptz, uuid, uuid[]) from public, anon, authenticated;
revoke execute on function public.own_photo_categories(uuid) from public, anon, authenticated;
grant execute on function public.own_photo_edit_root(uuid, text, uuid) to service_role;
grant execute on function public.own_photos_filtered(uuid, text, boolean, integer, timestamptz, uuid, timestamptz, uuid, uuid[]) to service_role;
grant execute on function public.own_photo_categories(uuid) to service_role;
