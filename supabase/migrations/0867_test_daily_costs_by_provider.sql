-- Keep the existing UTC daily totals and include what each provider/model charged.
create or replace function public.admin_test_daily_costs(p_days integer)
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
    with by_provider as (
      select date_trunc('day', x.started_at at time zone 'UTC') as day,
             coalesce(x.provider, 'unknown') as provider,
             coalesce(sum(x.cost_usd), 0) as cost_usd,
             bool_or(x.has_openrouter) as has_openrouter,
             count(*) as runs
        from public.admin_test_spend x
       where x.started_at >= v_start
       group by 1, 2
    ), days as (
      select p.day, sum(p.cost_usd) as cost_usd, sum(p.runs) as runs, bool_or(p.has_openrouter) as has_openrouter,
             jsonb_agg(jsonb_build_object('provider', p.provider, 'cost_usd', p.cost_usd, 'runs', p.runs)
                       order by p.provider) as by_provider
        from by_provider p group by p.day
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'day', to_char(d.day, 'YYYY-MM-DD'), 'cost_usd', d.cost_usd, 'runs', d.runs,
             'has_openrouter', d.has_openrouter, 'by_provider', d.by_provider
           ) order by d.day), '[]'::jsonb)
      from days d
  );
end;
$$;
