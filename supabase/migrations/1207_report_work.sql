-- T108 (ARCHITECTURE §9 第 8 条, §9.1): a signed-in visitor reports a work shown in the gallery.
-- Only works the gallery shows can be reported; once per person per work, 20 per person in any
-- 24 hours.
-- A report never hides the work by itself: it moves it to the top of the review page.
-- Returns 'reported', 'duplicate' or 'limited'; NOT_FOUND for a work the gallery does not show.
create function public.report_work(p_job_id uuid, p_reporter uuid, p_reason text, p_note text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if p_job_id is null or p_reporter is null then
    raise exception 'INVALID_INPUT' using detail = 'job and reporter are required';
  end if;
  if p_reason is null or p_reason not in ('sexual', 'violence', 'hate', 'minor', 'privacy', 'ip', 'spam', 'other') then
    raise exception 'INVALID_INPUT' using detail = 'unknown reason';
  end if;
  if v_note is not null and length(v_note) > 500 then
    raise exception 'INVALID_INPUT' using detail = 'note is at most 500 characters';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_reporter and p.banned_at is null) then
    raise exception 'FORBIDDEN';
  end if;
  if not exists (
      select 1 from public.generation_jobs j
       where j.id = p_job_id and j.status = 'succeeded' and j.visibility = 'public' and j.moderation_status = 'approved'
         and j.deleted_at is null and j.source = 'web' and j.template_id <> 'freeform' and j.template_id <> 'edit') then
    raise exception 'NOT_FOUND';
  end if;
  if exists (select 1 from public.work_reports r where r.job_id = p_job_id and r.reporter_id = p_reporter) then
    return 'duplicate';
  end if;
  -- Serialise one reporter's reports so two at once cannot both pass the daily cap.
  perform pg_advisory_xact_lock(hashtextextended('report_work:' || p_reporter::text, 0));
  if (select count(*) from public.work_reports r
       where r.reporter_id = p_reporter and r.created_at > now() - interval '1 day') >= 20 then
    return 'limited';
  end if;
  insert into public.work_reports (job_id, reporter_id, reason, note)
  values (p_job_id, p_reporter, p_reason, v_note)
  on conflict on constraint work_reports_once_per_reporter do nothing;
  return case when found then 'reported' else 'duplicate' end;
end;
$$;

revoke execute on function public.report_work(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.report_work(uuid, uuid, text, text) to service_role;
