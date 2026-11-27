-- 企业作品 (1941), follow-up from the #842 review (control 2026-11-22): a child of an org work
-- (an edit through parent_job_id, an again through again_of, a poster redraw through
-- inputs.poster.redraw_of) belongs to the same org even when the member paid it with their own
-- credits, so a company work cannot be carried off as a personal copy. 1941's stamp function,
-- recreated with that one step added after its cut-off checks; the trigger is unchanged.

create or replace function public._org_work_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_promo_org uuid;
  -- The poster redraw source, when inputs name a well-formed one (cast only then: SQL does not
  -- promise to check the pattern before casting).
  v_redraw uuid := case when new.inputs -> 'poster' ->> 'redraw_of' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                        then (new.inputs -> 'poster' ->> 'redraw_of')::uuid end;
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
    -- Nor claim a free poster redraw (a refund, grant_poster_free_redraw) against one.
    if v_redraw is not null and exists (
      select 1 from public.generation_jobs r where r.id = v_redraw and r.org_access_ended_at is not null) then
      new.inputs := new.inputs #- '{poster,redraw_of}';
      v_redraw := null;
    end if;
    -- An edit, again or poster redraw of an org work is an org work whoever paid (control
    -- 2026-11-22): it is made from the company's work. Sources are the maker's own (reserve_credits
    -- and set_job_again_of check that) and still reachable (cut ones were refused or dropped above).
    if new.org_id is null then
      new.org_id := coalesce(
        (select p.org_id from public.generation_jobs p where p.id = new.parent_job_id and p.user_id = new.user_id),
        (select a.org_id from public.generation_jobs a where a.id = new.again_of and a.user_id = new.user_id),
        (select r.org_id from public.generation_jobs r where r.id = v_redraw and r.user_id = new.user_id));
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
