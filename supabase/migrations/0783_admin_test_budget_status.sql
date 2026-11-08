-- T85: the daily budget for admin test runs (ARCHITECTURE §10.b 「费用」). The budget is the
-- system setting admin_test_daily_budget_usd (0788), $5 when unset. A day is a Beijing calendar
-- day, like the rest of the admin's "today". Spent is read from admin_test_spend (0782), so trimming
-- or deleting records never gives money back: each finished run's counted_usd, plus, for runs
-- still going (started in the last 10 minutes; older ones died with their function and hold
-- nothing), the estimate they reserved. Read by the panel, by the routes before any model call,
-- and by admin_begin_test_run (0784). Index: admin_test_spend_started_at_idx (0782).

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
           when x.counted_usd is not null then x.counted_usd
           when x.started_at > now() - interval '10 minutes' then x.estimate_usd
           else 0
         end), 0),
         count(*)
    into v_spent, v_runs
    from public.admin_test_spend x
   where x.started_at >= v_start;

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
