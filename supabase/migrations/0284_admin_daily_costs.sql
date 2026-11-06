-- T33: our side of /admin/costs (ARCHITECTURE §10.0): the summed cost_usd per day, set next to
-- what OpenAI billed. Days are UTC days, not the Beijing days of the rest of the admin, because
-- OpenAI's Costs API buckets by UTC day and the two columns must cover the same hours.
-- A job counts on the day it was created (when the provider call, and so the charge, happened).
-- Index: generation_jobs_created_at_id_idx (0160) for the range.
--
-- Per day: cost_usd, costed (jobs with a cost), uncosted (usage but no price) and no_usage
-- (finished jobs without usage: settled before T33, or the provider reported none).

create function public.admin_daily_costs(p_days integer)
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
    with jobs as (
      select date_trunc('day', g.created_at at time zone 'UTC') as day, g.status, g.provider_usage, g.cost_usd
        from public.generation_jobs g
       where g.created_at >= v_start
    ),
    per_day as (
      select j.day,
             coalesce(sum(j.cost_usd), 0) as cost_usd,
             count(*) filter (where j.cost_usd is not null) as costed,
             count(*) filter (where j.cost_usd is null and j.provider_usage is not null) as uncosted,
             count(*) filter (where j.cost_usd is null and j.provider_usage is null and j.status <> 'running') as no_usage
        from jobs j
       group by j.day
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'day', to_char(d.day, 'YYYY-MM-DD'),
             'cost_usd', coalesce(p.cost_usd, 0),
             'costed', coalesce(p.costed, 0),
             'uncosted', coalesce(p.uncosted, 0),
             'no_usage', coalesce(p.no_usage, 0)
           ) order by d.day), '[]'::jsonb)
      from generate_series(v_start at time zone 'UTC', v_today at time zone 'UTC', interval '1 day') as d(day)
      left join per_day p on p.day = d.day
  );
end;
$$;

revoke execute on function public.admin_daily_costs(integer) from public, anon, authenticated;
grant execute on function public.admin_daily_costs(integer) to service_role;
