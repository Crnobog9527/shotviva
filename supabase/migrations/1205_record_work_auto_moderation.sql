-- T108 (ARCHITECTURE §9 第 5 条, §9.1): the automatic screen's verdict on one public work. Flagged
-- works are rejected; unflagged ones are approved only while gallery_auto_approve is on, and
-- otherwise wait for a person. A person's earlier decision is never overwritten. Returns the
-- work's status afterwards, or null when the work is not a live public work (nothing written).
create function public.record_work_auto_moderation(p_job_id uuid, p_flagged boolean, p_categories text[])
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auto boolean;
  v_status text;
begin
  if p_job_id is null or p_flagged is null then
    raise exception 'INVALID_INPUT' using detail = 'job and verdict are required';
  end if;
  select coalesce((select s.value = 'true'::jsonb from public.system_settings s where s.key = 'gallery_auto_approve'), false)
    into v_auto;

  update public.generation_jobs j
     set auto_moderated_at = now(),
         last_screen_at = now(),
         screen_attempts = j.screen_attempts + 1,
         moderation_categories = coalesce(p_categories, '{}'),
         moderation_status = case
           when j.moderation_status <> 'pending' then j.moderation_status
           when p_flagged then 'rejected'
           when v_auto then 'approved'
           else 'pending' end,
         moderation_reason = case
           when j.moderation_status = 'pending' and p_flagged then 'auto' else j.moderation_reason end,
         moderated_at = case
           when j.moderation_status = 'pending' and (p_flagged or v_auto) then now() else j.moderated_at end
   where j.id = p_job_id and j.status = 'succeeded' and j.visibility = 'public' and j.deleted_at is null
  returning j.moderation_status into v_status;
  return v_status;
end;
$$;

revoke execute on function public.record_work_auto_moderation(uuid, boolean, text[]) from public, anon, authenticated;
grant execute on function public.record_work_auto_moderation(uuid, boolean, text[]) to service_role;
