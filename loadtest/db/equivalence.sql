-- Prints every sale decision the catalogue and the reservation path make, so the output
-- before and after a change to the sale guard can be diffed line by line. Runs in a
-- transaction that rolls back; the extra jobs give the spare and env routes a p95.
\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on
begin;
set local session_replication_role = replica;
insert into public.generation_jobs (id,user_id,module,template_id,inputs,provider,source,status,visibility,credits_cost,credit_pool,created_at,cost_usd,output_key,finished_at)
select gen_random_uuid(),(select id from public.profiles limit 1),'image','lt-tpl-1',
  jsonb_build_object('resolution',r,'quality',q),prov,'web','succeeded','private',1,'paid',now()-n*interval '1 hour',0.01*n,'x',now()
from generate_series(1,12) n, unnest(array['1k','2k']) r, unnest(array['medium','high']) q,
  unnest(array['11111111-0000-4000-8000-000000000002/lt/spare-model','env/gpt-image-1']) prov;
-- Legacy rows without a resolution count as 1k in the provider p95.
insert into public.generation_jobs (id,user_id,module,template_id,inputs,provider,source,status,visibility,credits_cost,credit_pool,created_at,cost_usd,output_key,finished_at)
select gen_random_uuid(),(select id from public.profiles limit 1),'image','lt-tpl-1','{}',
  '11111111-0000-4000-8000-000000000001/gpt-image-2.6-sunburst','web','succeeded','private',1,'paid',now()-n*interval '1 hour',0.3,'x',now()
from generate_series(1,40) n;
set local session_replication_role = origin;

select 'web', id, admin.web_standard_sale_allowed(id) from public.templates order by id;
select 'members', string_agg(id, ',' order by id) from public.web_template_members;
select 'entries', string_agg(entry_key||':'||coalesce(cover_template_id,''), ',' order by entry_key) from public.web_catalogue_entries;
select 'alt', r, res, q, price, admin.alternate_route_meets_floor(r, res, q, price)
from unnest(array['11111111-0000-4000-8000-000000000001/gpt-image-2.6-sunburst',
                  '11111111-0000-4000-8000-000000000002/lt/spare-model','env/gpt-image-1','nope/x']) r,
     unnest(array['1k','2k','3k','4k']) res, unnest(array['medium','high']) q, generate_series(0,400,3) price
order by 2,3,4,5;
select 'rra', t.id, r, tier, fb, admin.reservation_route_allowed(t, r, tier, (t.credits_cost->>tier)::int + d, fb, v2), d, v2
from public.templates t,
     unnest(array['11111111-0000-4000-8000-000000000001/gpt-image-2.6-sunburst',
                  '11111111-0000-4000-8000-000000000002/lt/spare-model','env/gpt-image-1']) r,
     unnest(array['1k','2k','3k']) tier, unnest(array[false,true]) fb, unnest(array[-40,0,40]) d, unnest(array[false,true]) v2
order by 2,3,4,5,7,8;
select 'jra', t.id, r, tier, admin.job_route_allowed(t, r, tier, (t.credits_cost->>tier)::int + d, v2), d, v2
from public.templates t,
     unnest(array['11111111-0000-4000-8000-000000000001/gpt-image-2.6-sunburst',
                  '11111111-0000-4000-8000-000000000002/lt/spare-model','env/gpt-image-1']) r,
     unnest(array['1k','2k','3k']) tier, unnest(array[-40,0,40]) d, unnest(array[false,true]) v2
order by 2,3,4,6,7;
select 'trapi', t.id, admin.template_route_allowed(t,'11111111-0000-4000-8000-000000000001/gpt-image-2.6-sunburst','2k',(t.credits_cost->>'2k')::int,false)
from public.templates t order by 2;
select 'wt', 'one', string_agg(id, ',' order by id) from public.web_templates(p_template_id=>'lt-tpl-1', p_include_members=>true);
select 'wt', 'grid', string_agg(id, ',' order by id) from public.web_templates();
select 'wt', 'members', string_agg(id, ',' order by id) from public.web_templates(p_include_members=>true);
select 'wt', 'series', string_agg(id, ',' order by id) from public.web_templates(p_series_id=>'22222222-0000-4000-8000-000000000001');
select 'wt', 'hidden', string_agg(id, ',' order by id) from public.web_templates(p_template_id=>'lt-tpl-250');
select 'gen', string_agg(t.id, ',' order by t.id) from public.templates t, public.web_generation_template(t.id) g where g.id = t.id;
select 'cat', string_agg(entry_key, ',' order by entry_key) from public.category_entries(array['lt-r2']);
-- Price-batch approval toggled off: the snapshot branch takes the alternate floor.
update admin.template_price_batches set reverted_at = now() where reverted_at is null;
select 'web-reverted', id, admin.web_standard_sale_allowed(id) from public.templates order by id;
rollback;
