-- Photos' filter (2039), kept on the reader's own index.
--
-- own_photos_filtered pages "order by created_at, id limit n" for one user. On a populated table
-- the planner answers that from generation_jobs_created_at_id_idx (every account's works by
-- time), because it matches the order exactly, and filters user_id row by row: for an account
-- whose works are few or old it reads everyone's newer rows before it meets a page of its own
-- (seen with EXPLAIN on a seeded local database: a generic plan picks that index for the page down
-- and for the window up alike).
--
-- The two page branches now break the tie on the id's text (collate "C": the same order as the
-- uuid, both compare the hex left to right), as 2040's personal branches do. No index matches
-- that, so the branch walks generation_jobs_user_id_created_at_idx (user_id, created_at) from the
-- cursor and sorts only the ties. The batch branch is unchanged (it reads generation_jobs_batch_slot).
--
-- Same name, same parameters, same rows in the same order: create or replace, so the grants stay
-- (service role only) and the code running before this keeps working on it.

create or replace function public.own_photos_filtered(
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
    order by j.created_at desc, (j.id::text collate "C") desc
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
    order by j.created_at asc, (j.id::text collate "C") asc
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
