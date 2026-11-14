-- T25: admin "查看作品" (ARCHITECTURE §10「后台查看作品」). One call writes the view_work audit
-- row and hands back what the server needs to sign the 5-minute R2 links, so a view can never
-- skip the log: no row, no keys. Writes to admin_audit_log only go through SQL functions (0006).
-- generation_jobs primary key.

create function public.admin_view_work(p_job_id uuid)
returns table (user_id uuid, status text, output_key text, input_key text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.generation_jobs;
begin
  select * into v_job from public.generation_jobs j where j.id = p_job_id;
  if not found then
    raise exception 'JOB_NOT_FOUND';
  end if;

  insert into public.admin_audit_log (action, user_id, target_id, reason)
  values ('view_work', v_job.user_id, p_job_id::text, '客服查看作品');

  return query select v_job.user_id, v_job.status, v_job.output_key, v_job.inputs ->> 'input_key', v_job.created_at;
end;
$$;

revoke execute on function public.admin_view_work(uuid) from public, anon, authenticated;
grant execute on function public.admin_view_work(uuid) to service_role;
