-- T82: note an explicit download of the caller's own finished work (0722). One update by
-- primary key; the first download keeps its time and IP, every one adds to the count. A work
-- that is not the caller's, not finished or deleted changes nothing (answers false).
create function public.record_job_download(p_job_id uuid, p_user_id uuid, p_ip inet default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.generation_jobs
     set downloaded_at = coalesce(downloaded_at, now()),
         download_ip = case when downloaded_at is null then p_ip else download_ip end,
         download_count = download_count + 1
   where id = p_job_id
     and user_id = p_user_id
     and status = 'succeeded'
     and deleted_at is null;
  return found;
end;
$$;

revoke execute on function public.record_job_download(uuid, uuid, inet) from public, anon, authenticated;
grant execute on function public.record_job_download(uuid, uuid, inet) to service_role;
