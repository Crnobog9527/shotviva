-- T85: settles an admin test run (ARCHITECTURE §10.b), the counterpart of confirm_job / refund_job
-- for a run nobody pays for: the result key or the error, the provider's usage and real cost
-- (§10.0; a failure the provider still billed keeps its cost), and how long it took. Only a
-- running row changes; a repeat returns the row as it was settled.

create function public.admin_finish_test_run(
  p_run_id uuid,
  p_status text,
  p_output_key text,
  p_error_code text,
  p_provider_usage jsonb,
  p_cost_usd numeric,
  p_duration_ms integer
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row public.admin_test_runs;
begin
  if p_status is null or p_status not in ('succeeded', 'failed') then
    raise exception 'INVALID_INPUT' using detail = 'status must be succeeded or failed';
  end if;
  if p_status = 'succeeded' and p_output_key is null then
    raise exception 'INVALID_INPUT' using detail = 'a succeeded run needs its output';
  end if;

  update public.admin_test_runs r
     set status = p_status,
         output_key = case when p_status = 'succeeded' then p_output_key end,
         error_code = case when p_status = 'failed' then coalesce(p_error_code, 'GENERATION_FAILED') end,
         provider_usage = p_provider_usage,
         cost_usd = p_cost_usd,
         duration_ms = p_duration_ms,
         finished_at = now()
   where r.id = p_run_id and r.status = 'running'
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from public.admin_test_runs r where r.id = p_run_id;
    if not found then
      raise exception 'TEST_RUN_NOT_FOUND';
    end if;
  end if;
  return to_jsonb(v_row);
end;
$$;

revoke execute on function public.admin_finish_test_run(uuid, text, text, text, jsonb, numeric, integer) from public, anon, authenticated;
grant execute on function public.admin_finish_test_run(uuid, text, text, text, jsonb, numeric, integer) to service_role;
