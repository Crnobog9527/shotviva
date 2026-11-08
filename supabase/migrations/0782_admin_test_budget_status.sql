-- T85: the daily budget for admin test runs (ARCHITECTURE §10.b 「费用」). The budget is the
-- system setting admin_test_daily_budget_usd (0787), $5 when unset. A day is a Beijing calendar
-- day, like the rest of the admin's "today". Spent is the real cost of today's finished runs plus,
-- for runs still going (started in the last 10 minutes; older ones died with their function and
-- hold nothing), the estimate they reserved. Read by the panel and by admin_begin_test_run (0783).
-- Index: admin_test_runs_created_at_idx (0781).

create function public.admin_test_budget_status()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_start timestamptz := date_trunc('day', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai';
  v_budget numeric;
  v_spent numeric;
  v_runs integer;
begin
  select case when jsonb_typeof(s.value) = 'number' then (s.value #>> '{}')::numeric end
    into v_budget
    from public.system_settings s
   where s.key = 'admin_test_daily_budget_usd';

  select coalesce(sum(case
           when r.status = 'running' and r.created_at > now() - interval '10 minutes' then r.estimate_usd
           when r.status = 'running' then 0
           else coalesce(r.cost_usd, 0)
         end), 0),
         count(*)
    into v_spent, v_runs
    from public.admin_test_runs r
   where r.created_at >= v_start;

  return jsonb_build_object(
    'budget_usd', coalesce(v_budget, 5),
    'spent_usd', round(v_spent, 6),
    'runs', v_runs,
    'day', to_char(now() at time zone 'Asia/Shanghai', 'YYYY-MM-DD')
  );
end;
$$;

revoke execute on function public.admin_test_budget_status() from public, anon, authenticated;
grant execute on function public.admin_test_budget_status() to service_role;
