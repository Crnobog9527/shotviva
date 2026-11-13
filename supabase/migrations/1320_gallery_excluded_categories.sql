-- Owner 2026-11-12 (ARCHITECTURE §5 category fields, §9 第 1、7 条): works made from a template
-- whose ROOT category is marked gallery_excluded are never public and never reach the gallery,
-- whichever pool paid for them. The posters root is marked: its works draw real shop names,
-- addresses and phone numbers into the image, so keeping the text fields private is not enough.
-- Watermark, credits and prices are unchanged: a free poster work is still watermarked.
--
-- The decision is taken once, when the job row is inserted (inside reserve_credits, which holds
-- the template row `for share`), and stored on the job. Moving a template to another category
-- later, or unmarking the root, never changes a work already made. Everything public in the
-- gallery (moderation queue, screen sweep, record_work_auto_moderation, admin_moderate_works,
-- report_work, the gallery reads and image route) already requires visibility = 'public', so a
-- private work is outside all of them without touching those functions.

-- 1. The flag on a category. Only a ROOT's value is read: a sub-category follows its root, so a
--    value set on a sub-category has no effect.
alter table public.template_categories
  add column gallery_excluded boolean not null default false;

update public.template_categories set gallery_excluded = true where key = 'posters';

-- The posters root may be created after this migration (template sync, or a fresh database):
-- it starts marked. Admins can unmark it later with an ordinary update.
create function admin.default_category_gallery_excluded() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.key = 'posters' and new.parent_id is null then
    new.gallery_excluded := true;
  end if;
  return new;
end $$;

create trigger category_gallery_excluded_default before insert on public.template_categories
for each row execute function admin.default_category_gallery_excluded();

-- 2. The decision stored on the job.
alter table public.generation_jobs
  add column gallery_excluded boolean not null default false;

-- A free work may now be private, but only when it is excluded (the table check of 0004 widened).
alter table public.generation_jobs
  drop constraint generation_jobs_free_work_public,
  add constraint generation_jobs_free_work_public
    check (credit_pool = 'paid' or visibility = 'public' or gallery_excluded);

-- On insert: excluded when the template's root category is marked, or when the work is an edit
-- of an excluded work (an edit redraws the same poster). An excluded work is always private,
-- whatever the caller asked for, so reserve_credits / reserve_batch_cell and the code deployed
-- before this migration need no change. The flag can never be cleared.
create function admin.keep_gallery_excluded_private() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.gallery_excluded := new.gallery_excluded
      or exists (
        select 1 from public.templates t
          join public.template_category_paths p on p.key = coalesce(t.subcategory_key, t.category_key)
          join public.template_categories r on r.key = p.root_key
         where t.id = new.template_id and r.gallery_excluded)
      or exists (
        select 1 from public.generation_jobs parent
         where parent.id = new.parent_job_id and parent.gallery_excluded);
  elsif old.gallery_excluded and not new.gallery_excluded then
    raise exception 'GALLERY_EXCLUDED_IMMUTABLE';
  end if;
  if new.gallery_excluded then
    new.visibility := 'private';
  end if;
  return new;
end $$;

create trigger generation_jobs_gallery_excluded
before insert or update of gallery_excluded, visibility on public.generation_jobs
for each row execute function admin.keep_gallery_excluded_private();

revoke all on function admin.default_category_gallery_excluded() from public, anon, authenticated, service_role;
revoke all on function admin.keep_gallery_excluded_private() from public, anon, authenticated, service_role;

-- 3. Works already made from a marked root, and edits of them (any depth), become excluded and
--    so private through the trigger above. Their moderation fields are kept as they are; the
--    gallery stops showing them because they are no longer public.
with recursive excluded as (
  select j.id from public.generation_jobs j
    join public.templates t on t.id = j.template_id
    join public.template_category_paths p on p.key = coalesce(t.subcategory_key, t.category_key)
    join public.template_categories r on r.key = p.root_key
   where r.gallery_excluded
  union
  select child.id from public.generation_jobs child join excluded e on child.parent_job_id = e.id
)
update public.generation_jobs set gallery_excluded = true
 where id in (select id from excluded) and not gallery_excluded;

-- 4. The owner's public/private toggle (latest 0340): an excluded work cannot be made public
--    (WORK_PRIVATE_ONLY), and asking an excluded free work to be private is not FREE_WORK_PUBLIC.
create or replace function public.set_job_visibility(p_job_id uuid, p_user_id uuid, p_visibility text)
returns public.generation_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.generation_jobs;
begin
  if p_visibility is null or p_visibility not in ('public', 'private') then
    raise exception 'INVALID_INPUT' using detail = 'visibility must be public or private';
  end if;

  select * into v_job from public.generation_jobs
   where id = p_job_id and user_id = p_user_id and deleted_at is null
     for update;
  if not found then
    raise exception 'JOB_NOT_FOUND';
  end if;

  if v_job.gallery_excluded then
    if p_visibility = 'public' then
      raise exception 'WORK_PRIVATE_ONLY';
    end if;
    return v_job;
  end if;

  if v_job.credit_pool = 'free' and p_visibility = 'private' then
    raise exception 'FREE_WORK_PUBLIC';
  end if;

  update public.generation_jobs set visibility = p_visibility where id = p_job_id
  returning * into v_job;
  return v_job;
end;
$$;
