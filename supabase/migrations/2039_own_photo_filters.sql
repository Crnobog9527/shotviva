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

create function public.own_photo_roots(p_user uuid)
returns table (job_id uuid, category_key text)
language sql
stable
set search_path = ''
as $$
  with recursive walk as (
    select j.id, j.template_id, j.parent_job_id, 0 as depth
      from public.generation_jobs j
     where j.user_id = p_user and j.status = 'succeeded'
       and j.deleted_at is null and j.org_access_ended_at is null
    union all
    select w.id, p.template_id, p.parent_job_id, w.depth + 1
      from walk w
      join public.templates t on t.id = w.template_id
      join public.template_categories c on c.key = t.category_key and c.is_system
      join public.generation_jobs p on p.id = w.parent_job_id and p.user_id = p_user
     where w.depth < 30
  )
  select distinct on (w.id) w.id, t.category_key
    from walk w
    join public.templates t on t.id = w.template_id
   order by w.id, w.depth desc;
$$;

-- The filter's chips: each category p_user has finished works in, with how many and how many of
-- them carry a watermark (paid from the free pool). Built-in categories come too (is_system), so
-- the rows add up to every finished work; the page offers no chip for those.
create function public.own_photo_categories(p_user uuid)
returns table (category_key text, name_en text, name_zh text, sort_order integer, is_system boolean,
               works integer, watermarked integer)
language sql
stable
set search_path = ''
as $$
  select c.key, c.name_en, c.name_zh, c.sort_order, c.is_system,
         count(*)::integer, (count(*) filter (where j.credit_pool = 'free'))::integer
    from public.own_photo_roots(p_user) r
    join public.generation_jobs j on j.id = r.job_id
    join public.template_categories c on c.key = r.category_key
   group by c.key, c.name_en, c.name_zh, c.sort_order, c.is_system
   order by c.sort_order, c.key;
$$;

-- The works under one filter, as generation_jobs rows, so the page orders, pages and counts them
-- exactly as it does the unfiltered list. p_category: one root category. p_watermarked: only the
-- works that carry a watermark. With neither it is every finished work.
create function public.own_photos_filtered(p_user uuid, p_category text default null, p_watermarked boolean default false)
returns setof public.generation_jobs
language sql
stable
set search_path = ''
as $$
  select j.*
    from public.own_photo_roots(p_user) r
    join public.generation_jobs j on j.id = r.job_id
   where (p_category is null or r.category_key = p_category)
     and (not coalesce(p_watermarked, false) or j.credit_pool = 'free');
$$;

revoke execute on function public.own_photo_roots(uuid) from public, anon, authenticated;
revoke execute on function public.own_photo_categories(uuid) from public, anon, authenticated;
revoke execute on function public.own_photos_filtered(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.own_photo_roots(uuid) to service_role;
grant execute on function public.own_photo_categories(uuid) to service_role;
grant execute on function public.own_photos_filtered(uuid, text, boolean) to service_role;
