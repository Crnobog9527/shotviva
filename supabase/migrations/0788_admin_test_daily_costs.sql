-- T85: admin test runs on /admin/costs (ARCHITECTURE §10.b 「费用」, §10.0). The same UTC days as
-- admin_daily_costs (0284), so OpenAI's bill and our two columns cover the same hours; a run counts
-- on the day it started. The page adds this to 「我们记录的成本」 and shows it as 后台试跑.
-- Index: admin_test_runs_created_at_idx (0781).

create function public.admin_test_daily_costs(p_days integer)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_today timestamptz;
  v_start timestamptz;
begin
  if p_days is null or p_days < 1 or p_days > 90 then
    raise exception 'INVALID_INPUT' using detail = 'p_days must be between 1 and 90';
  end if;

  v_today := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  v_start := v_today - make_interval(days => p_days - 1);

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'day', to_char(p.day, 'YYYY-MM-DD'),
             'cost_usd', p.cost_usd,
             'runs', p.runs
           ) order by p.day), '[]'::jsonb)
      from (
        select date_trunc('day', r.created_at at time zone 'UTC') as day,
               coalesce(sum(r.cost_usd), 0) as cost_usd,
               count(*) as runs
          from public.admin_test_runs r
         where r.created_at >= v_start
         group by 1
      ) p
  );
end;
$$;

revoke execute on function public.admin_test_daily_costs(integer) from public, anon, authenticated;
grant execute on function public.admin_test_daily_costs(integer) to service_role;
