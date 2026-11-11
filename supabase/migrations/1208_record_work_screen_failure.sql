-- T108 (ARCHITECTURE §9 第 5 条, §9.1): one failed automatic screen of a public work (its file is
-- missing, the API refused or timed out). Counts the attempt and when, so the sweep backs off and
-- gives up after a few; the work stays pending for a person. Returns the attempts so far, or null
-- when the work is not a live public work still waiting for its screen (nothing written).
create function public.record_work_screen_failure(p_job_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
begin
  if p_job_id is null then
    raise exception 'INVALID_INPUT' using detail = 'job is required';
  end if;
  update public.generation_jobs j
     set screen_attempts = j.screen_attempts + 1,
         last_screen_at = now()
   where j.id = p_job_id and j.status = 'succeeded' and j.visibility = 'public' and j.deleted_at is null
     and j.moderation_status = 'pending' and j.auto_moderated_at is null
  returning j.screen_attempts into v_attempts;
  return v_attempts;
end;
$$;

revoke execute on function public.record_work_screen_failure(uuid) from public, anon, authenticated;
grant execute on function public.record_work_screen_failure(uuid) to service_role;
