-- EXPLAIN (ANALYZE, BUFFERS) for the catalogue reads, as the API roles run them.
\set ON_ERROR_STOP on
\pset pager off
begin;
set local role anon;
\echo '== Q1 web_templates(p_template_id, p_include_members) — one template page'
explain (analyze, buffers, costs off, summary on) select id from public.web_templates(p_template_id=>'lt-tpl-1', p_include_members=>true);
\echo '== Q2 web_templates() — the standalone grid'
explain (analyze, buffers, costs off, summary on) select id from public.web_templates();
\echo '== Q3 web_templates(p_series_id) — one series'
explain (analyze, buffers, costs off, summary on) select id from public.web_templates(p_series_id=>'22222222-0000-4000-8000-000000000001');
\echo '== Q4 web_catalogue_entries — catalogue index'
explain (analyze, buffers, costs off, summary on) select entry_key from public.web_catalogue_entries;
\echo '== Q5 web_template_members — catalogue index members'
explain (analyze, buffers, costs off, summary on) select id from public.web_template_members;
rollback;
begin;
set local role service_role;
\echo '== Q6 web_generation_template — the generate page'
explain (analyze, buffers, costs off, summary on) select id from public.web_generation_template('lt-tpl-1');
\echo '== Q7 unavailable_batch_template — batch preflight'
explain (analyze, buffers, costs off, summary on) select public.unavailable_batch_template('[{"template_id":"lt-tpl-1","resolution":"1k","provider":"11111111-0000-4000-8000-000000000001/gpt-image-2.6-sunburst","expected_credits":120}]');
rollback;
