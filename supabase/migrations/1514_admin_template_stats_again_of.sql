-- admin_template_stats (1511, ARCHITECTURE §16.2c) counts redraws exactly from now on: a job is a
-- redraw when it was made with Make again (generation_jobs.again_of, 1512/1513) or is a poster
-- redraw that names its source (inputs.poster.redraw_of). The 30-minute approximation of 1511 is
-- dropped, also for jobs made before again_of existed: those show no redraws unless they are
-- named poster redraws. Mixing an estimate for old jobs with exact counts for new ones would make
-- periods before and after the release look comparable when they are not.
-- p_redraw_minutes stays in the signature (callers still pass it) and is still validated, but
-- no longer used; redraw_minutes is still returned so the running code's reader keeps working.
-- Everything else is as in 1511. Same signature, so create or replace keeps the grants
-- (service_role only). It also returns redraw_since, the first Make again ever recorded, so the
-- page can say from when redraws count and show no rate for a period that starts earlier.
-- Index: generation_jobs_created_at_id_idx, as before; redraw_since reads only the rows of
-- generation_jobs_again_of_idx (partial, Make again jobs only).

create or replace function public.admin_template_stats(
  p_start timestamptz,
  p_end timestamptz,
  p_redraw_minutes integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_start is null or p_end is null or p_start >= p_end
     or p_end - p_start > interval '93 days' or p_end > now() + interval '5 minutes'
     or p_redraw_minutes is null or p_redraw_minutes < 1 or p_redraw_minutes > 1440 then
    raise exception 'INVALID_INPUT' using detail = 'one ordered period of at most 93 days, not in the future; redraw gap 1–1440 minutes';
  end if;

  return (
    with staff as (
      select pr.id from public.profiles pr where pr.role = 'admin'
    ),
    jobs as (
      select g.id, g.user_id, g.template_id, g.status, g.error_code, g.created_at,
             g.credits_cost, g.credit_pool, g.cost_usd,
             g.again_of is not null or coalesce(g.inputs -> 'poster' ? 'redraw_of', false) as redraw
        from public.generation_jobs g
       where g.created_at >= p_start and g.created_at < p_end and g.status <> 'running'
         and not exists (select from staff s where s.id = g.user_id)
    ),
    per_template as (
      select j.template_id,
             count(*) as uses,
             count(distinct j.user_id) as users,
             count(*) filter (where j.status = 'succeeded') as succeeded,
             count(*) filter (where j.status = 'failed') as failed,
             count(*) filter (where j.redraw) as redraws,
             count(*) filter (where j.cost_usd is not null) as costed,
             coalesce(sum(j.cost_usd), 0) as cost_usd,
             coalesce(sum(j.cost_usd) filter (where j.credit_pool = 'paid'), 0) as paid_cost_usd,
             coalesce(sum(j.cost_usd) filter (where j.credit_pool = 'free'), 0) as free_cost_usd,
             coalesce(sum(j.credits_cost) filter (where j.status = 'succeeded'), 0) as credits,
             coalesce(sum(j.credits_cost) filter (where j.status = 'succeeded' and j.credit_pool = 'paid'), 0) as paid_credits
        from jobs j
       group by j.template_id
    ),
    errors as (
      select e.template_id, jsonb_agg(jsonb_build_object('code', e.code, 'count', e.n) order by e.n desc, e.code) as top
        from (
          select j.template_id, coalesce(j.error_code, 'UNKNOWN') as code, count(*) as n,
                 row_number() over (partition by j.template_id order by count(*) desc, coalesce(j.error_code, 'UNKNOWN')) as rank
            from jobs j
           where j.status = 'failed'
           group by j.template_id, coalesce(j.error_code, 'UNKNOWN')
        ) e
       where e.rank <= 3
       group by e.template_id
    ),
    recent as (
      select g.template_id, count(*) as uses_14d
        from public.generation_jobs g
       where g.created_at >= now() - interval '14 days' and g.status <> 'running'
         and not exists (select from staff s where s.id = g.user_id)
       group by g.template_id
    ),
    favourites as (
      select f.template_id, count(*) as total, count(*) filter (where f.created_at >= p_start and f.created_at < p_end) as added
        from public.template_favorites f
       where not exists (select from staff s where s.id = f.user_id)
       group by f.template_id
    ),
    ids as (
      select t.id from public.templates t where t.deleted_at is null
      union
      select p.template_id from per_template p
    )
    select jsonb_build_object(
      'timezone', 'Asia/Shanghai',
      'redraw_minutes', p_redraw_minutes,
      -- When redraws started to be counted: the first job ever recorded as Make again. Null
      -- until there is one. The page shows no redraw rate for a period that starts earlier.
      'redraw_since', (select min(g.created_at) from public.generation_jobs g where g.again_of is not null),
      'templates', coalesce(jsonb_agg(jsonb_build_object(
        'template_id', i.id,
        'name', t.name,
        'name_zh', t.translations -> 'zh' ->> 'name',
        'category_key', t.category_key,
        'category_name', c.name_zh,
        'subcategory_key', t.subcategory_key,
        'series_id', t.series_id,
        'series_name', s.name_zh,
        'live', coalesce(t.is_active and t.deleted_at is null and 'web' = any (t.visible_in), false),
        'uses', coalesce(p.uses, 0),
        'users', coalesce(p.users, 0),
        'succeeded', coalesce(p.succeeded, 0),
        'failed', coalesce(p.failed, 0),
        'redraws', coalesce(p.redraws, 0),
        'costed', coalesce(p.costed, 0),
        'cost_usd', coalesce(p.cost_usd, 0),
        'paid_cost_usd', coalesce(p.paid_cost_usd, 0),
        'free_cost_usd', coalesce(p.free_cost_usd, 0),
        'credits', coalesce(p.credits, 0),
        'paid_credits', coalesce(p.paid_credits, 0),
        'errors', coalesce(e.top, '[]'::jsonb),
        'uses_14d', coalesce(r.uses_14d, 0),
        'favourites', coalesce(f.total, 0),
        'favourites_added', coalesce(f.added, 0)
      ) order by coalesce(p.uses, 0) desc, i.id), '[]'::jsonb)
    )
      from ids i
      left join public.templates t on t.id = i.id
      left join public.template_series s on s.id = t.series_id
      left join public.template_categories c on c.key = t.category_key
      left join per_template p on p.template_id = i.id
      left join errors e on e.template_id = i.id
      left join recent r on r.template_id = i.id
      left join favourites f on f.template_id = i.id
  );
end;
$$;
