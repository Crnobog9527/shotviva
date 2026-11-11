-- Run the per-template sale check (web_standard_sale_allowed) only on the templates a read
-- asks for, and once per template. Before, a one-template lookup checked every published
-- template: the check sits on the templates scan, below the join that decides standalone,
-- series and id matches. The catalogue entries checked series members a second time for
-- each series cover. Which rows come back is unchanged.
create or replace function public.web_templates(p_series_id uuid default null, p_template_id text default null,
  p_include_members boolean default false) returns setof public.templates
language sql stable set search_path=''
-- A standard SQL body is bound when it is created, like a view, so anon and authenticated
-- read admin.published_web_members (granted in 1172) without usage on the admin schema.
begin atomic
  with candidates as materialized (
    select m.id from admin.published_web_members m
    where (p_series_id is null and p_template_id is null and (m.standalone or p_include_members))
      or m.series_id=p_series_id or m.id=p_template_id
  )
  select t.* from candidates c join public.templates t on t.id=c.id where admin.web_standard_sale_allowed(c.id);
end;

create or replace view public.web_catalogue_entries with (security_invoker=true) as
with members as materialized (select * from public.web_template_members)
select 'template'::text as type,'template-'||m.id as entry_key,m.sort_order,m.category_key,
       m.id as template_id,null::uuid as series_id,null::text as cover_template_id
from members m where m.standalone
union all
select 'series'::text,'series-'||s.id,s.sort_order,c.key,null::text,s.id,cover.id
from public.template_series s
join public.template_category_paths c on c.key=s.category_key and c.web_visible
cross join lateral (select m.id from members m where m.series_id=s.id
                    order by m.series_sort_order,m.id limit 1) cover
where s.is_active;
