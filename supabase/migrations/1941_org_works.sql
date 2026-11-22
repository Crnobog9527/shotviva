-- 企业作品 (Owner 2026-11-22): a work an active org member makes with the org's credits belongs to
-- the org. It is never public, the org owner sees it in the workbench, and the member keeps it only
-- while they are an active member of that org.
--
-- org_id: the org whose credits paid for the job. reserve_credits debits the ledger before it
-- inserts the job, and that debit is what writes org_held_draws (debit_key 'job:<id>:reserve',
-- _org_held_follows_ledger) when it dips into the member's held org credits. So the row exists
-- when the job is inserted and a BEFORE INSERT trigger stamps the job without touching
-- reserve_credits. Batch cells, posters, again and edits all reserve through it with that key.
-- Works the person paid for with their own credits have no draw and stay personal.
--
-- org_access_ended_at: when the maker stopped being an active member of org_id (null while they
-- are). Kept by a trigger on org_members, so every user-facing read stays a flat column check
-- (AGENTS §5.1 第 7 条) instead of a membership lookup per row.
--
-- Expand-only: two nullable columns, a partial index, triggers. The deployed code never names the
-- columns; its inserts are stamped by the trigger and its visibility writes keep working (an org
-- work refuses 'public' with the WORK_PRIVATE_ONLY it already handles for posters). The backfill
-- sets only the new columns; the trigger then makes the backfilled works private.

alter table public.generation_jobs
  add column org_id uuid references public.orgs (id),
  add column org_access_ended_at timestamptz;

comment on column public.generation_jobs.org_id is
  'The org whose credits paid for this work (企业作品, 1941). Set once at insert from org_held_draws; never public.';
comment on column public.generation_jobs.org_access_ended_at is
  'When the maker left org_id (1941). Non-null: the work is hidden from the maker, their shares and files.';

-- The owner's 企业作品 list: newest first per org, optionally one member.
create index generation_jobs_org_works_idx on public.generation_jobs (org_id, created_at desc, id desc)
  where org_id is not null;
create index generation_jobs_org_member_works_idx on public.generation_jobs (org_id, user_id, created_at desc, id desc)
  where org_id is not null;

-- Runs after generation_jobs_again_of and generation_jobs_gallery_excluded (triggers fire by name),
-- so again_of is resolved and the category rule has run.
create function public._org_work_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_promo_org uuid;
begin
  if tg_op = 'INSERT' then
    -- Never taken from the caller: only the reserve debit decides.
    new.org_id := (select d.org_id from public.org_held_draws d
                    where d.debit_key = 'job:' || new.id::text || ':reserve' and d.user_id = new.user_id);
    -- The org's promo credits (#836) are org credits too. Looked up dynamically so this works
    -- before and after that table exists, without depending on its migration.
    if new.org_id is null and to_regclass('public.org_promo_draws') is not null then
      execute 'select org_id from public.org_promo_draws where debit_key = $1 and user_id = $2'
        into v_promo_org using 'job:' || new.id::text || ':reserve', new.user_id;
      new.org_id := v_promo_org;
    end if;
    new.org_access_ended_at := null;
    -- An ex-member cannot edit or redraw a work of the org they left: it looks missing, as
    -- reserve_credits' own parent check would say.
    if new.parent_job_id is not null and exists (
      select 1 from public.generation_jobs p where p.id = new.parent_job_id and p.org_access_ended_at is not null) then
      raise exception 'PARENT_JOB_NOT_FOUND';
    end if;
    if new.again_of is not null and exists (
      select 1 from public.generation_jobs a where a.id = new.again_of and a.org_access_ended_at is not null) then
      new.again_of := null;
    end if;
  elsif old.org_id is not null and new.org_id is distinct from old.org_id then
    raise exception 'ORG_WORK_IMMUTABLE';
  end if;
  if new.org_id is not null then
    new.gallery_excluded := true;
    new.visibility := 'private';
  end if;
  return new;
end $$;

create trigger generation_jobs_org_work
before insert or update of org_id, visibility, gallery_excluded on public.generation_jobs
for each row execute function public._org_work_stamp();

-- Leaving (removed) cuts the maker off from that org's works; joining again restores them.
create function public._org_member_works_access() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = old.status then return new; end if;
  update public.generation_jobs
     set org_access_ended_at = case when new.status = 'active' then null else coalesce(new.removed_at, now()) end
   where org_id = new.org_id and user_id = new.user_id;
  return new;
end $$;

create trigger org_members_works_access
after update of status on public.org_members
for each row execute function public._org_member_works_access();

revoke all on function public._org_work_stamp() from public, anon, authenticated, service_role;
revoke all on function public._org_member_works_access() from public, anon, authenticated, service_role;

-- Backfill every past job from its reserve draw, and whether its maker has since left. Sets only
-- the new columns; generation_jobs_org_work then makes these works private and gallery-excluded
-- (Owner: any org work already public is pulled).
update public.generation_jobs j
   set org_id = d.org_id,
       org_access_ended_at = case when m.status = 'active' then null else coalesce(m.removed_at, now()) end
  from public.org_held_draws d
  left join public.org_members m on m.org_id = d.org_id and m.user_id = d.user_id
 where d.debit_key = 'job:' || j.id::text || ':reserve' and d.user_id = j.user_id and j.org_id is null;
