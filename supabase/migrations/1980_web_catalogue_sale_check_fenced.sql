-- The catalogue entries run the per-template sale check (admin.web_standard_sale_allowed) once
-- per published template whatever plan Postgres picks (1253 meant to; it held only for some
-- plans). Through web_template_members the check is a filter on the templates scan, and when
-- the planner puts that scan inside a nested loop over the categories (stale statistics, or
-- enable_seqscan off) the check runs once per category for every template: 8 times in CI, and
-- on every catalogue read in production if its statistics lead there. Here the published
-- members are materialized first and the check runs over that list, so each one is checked
-- exactly once. Same columns, rows and order as before; web_template_members itself is
-- unchanged, so a lookup by id (template_share_create) still checks only that template.
create or replace view public.web_catalogue_entries with (security_invoker=true) as
with published as materialized (select * from admin.published_web_members),
members as materialized (select * from published p where admin.web_standard_sale_allowed(p.id))
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
