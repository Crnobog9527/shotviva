-- T82 (ARCHITECTURE §6.3 「拒付申诉证据」): note the IP of the website request that started a
-- generation or edit (generation_jobs.client_ip, 0722), so the dispute evidence can show each
-- work's time and IP. Called right after reserve_credits by the request that created the job.
--
-- A function of its own rather than a new reserve_credits parameter: changing that signature
-- means dropping the deployed one, which the expand-only rule forbids (AGENTS §5, #305). First
-- write wins; only the caller's own web jobs (a partner call's IP is Graylum's server).
create function public.record_job_client_ip(p_job_id uuid, p_user_id uuid, p_ip inet)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.generation_jobs
     set client_ip = p_ip
   where id = p_job_id
     and user_id = p_user_id
     and source = 'web'
     and client_ip is null;
  return found;
end;
$$;

revoke execute on function public.record_job_client_ip(uuid, uuid, inet) from public, anon, authenticated;
grant execute on function public.record_job_client_ip(uuid, uuid, inet) to service_role;
