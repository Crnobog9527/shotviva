-- /admin/costs per image provider (ARCHITECTURE §10.0): our recorded cost per UTC day, split by
-- who bills us — 'openai', 'openrouter' or 'ark' (Volcano Engine Ark) — so each can be set
-- against that provider's own bill. Users' jobs and admin test runs are kept apart.
-- Read-only; admin_daily_costs (0866) and admin_test_daily_costs (0867) stay as they are.
--
-- Which provider: the job's provider tag is '<ai_providers.id>/<model>' (T17), so the row's
-- adapter decides. Tags without a row ('env/…' is the OPENAI_API_KEY fallback, pre-T17
-- 'openai-image', or a deleted row) fall back to the usage shape: Ark records list_cost_cny,
-- OpenRouter records cost / *_tokens like 0866's has_openrouter; anything else is OpenAI.
-- cost_cny is Ark's list price in yuan as recorded per job (provider_usage.list_cost_cny);
-- for test runs it is read from the run row while it still exists (runs are trimmed at 30 days).

create function public.cost_provider_family(p_tag text, p_usage jsonb)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when a.adapter = 'ark_images' then 'ark'
    when a.adapter = 'openrouter_images' then 'openrouter'
    when a.adapter is not null then 'openai'
    when p_usage ? 'list_cost_cny' then 'ark'
    when coalesce(p_usage ?| array['cost', 'prompt_tokens', 'completion_tokens'], false) then 'openrouter'
    else 'openai'
  end
  from (select (select p.adapter from public.ai_providers p
                 where p.id::text = split_part(coalesce(p_tag, ''), '/', 1)) as adapter) a;
$$;

revoke execute on function public.cost_provider_family(text, jsonb) from public, anon, authenticated;
grant execute on function public.cost_provider_family(text, jsonb) to service_role;

create function public.admin_daily_costs_by_provider(p_days integer)
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
      select date_trunc('day', g.created_at at time zone 'UTC') as day,
             public.cost_provider_family(g.provider, g.provider_usage) as provider,
             g.status, g.provider_usage, g.cost_usd
        from public.generation_jobs g
       where g.created_at >= v_start
    ),
    job_days as (
      select j.day, j.provider,
             coalesce(sum(j.cost_usd), 0) as cost_usd,
             coalesce(sum((j.provider_usage ->> 'list_cost_cny')::numeric) filter (where j.cost_usd is not null), 0) as cost_cny,
             count(*) filter (where j.cost_usd is not null) as costed,
             count(*) filter (where j.cost_usd is null and j.provider_usage is not null) as uncosted,
             count(*) filter (where j.cost_usd is null and j.provider_usage is null and j.status <> 'running') as no_usage
        from jobs j
       group by 1, 2
    ),
    test_days as (
      select date_trunc('day', x.started_at at time zone 'UTC') as day,
             public.cost_provider_family(x.provider, r.provider_usage) as provider,
             coalesce(sum(x.cost_usd), 0) as cost_usd,
             coalesce(sum((r.provider_usage ->> 'list_cost_cny')::numeric) filter (where x.cost_usd is not null), 0) as cost_cny,
             count(*) as runs
        from public.admin_test_spend x
        left join public.admin_test_runs r on r.id = x.run_id
       where x.started_at >= v_start
       group by 1, 2
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'day', to_char(coalesce(j.day, t.day), 'YYYY-MM-DD'),
             'provider', coalesce(j.provider, t.provider),
             'cost_usd', coalesce(j.cost_usd, 0),
             'cost_cny', coalesce(j.cost_cny, 0),
             'costed', coalesce(j.costed, 0),
             'uncosted', coalesce(j.uncosted, 0),
             'no_usage', coalesce(j.no_usage, 0),
             'test_cost_usd', coalesce(t.cost_usd, 0),
             'test_cost_cny', coalesce(t.cost_cny, 0),
             'test_runs', coalesce(t.runs, 0)
           ) order by coalesce(j.day, t.day), coalesce(j.provider, t.provider)), '[]'::jsonb)
      from job_days j
      full join test_days t on t.day = j.day and t.provider = j.provider
  );
end;
$$;

revoke execute on function public.admin_daily_costs_by_provider(integer) from public, anon, authenticated;
grant execute on function public.admin_daily_costs_by_provider(integer) to service_role;
