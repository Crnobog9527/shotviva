-- One catalogue page view's worth of reads, the mix the app issues per uncached request.
\set n random(1, 15)
begin;
set local role anon;
select entry_key from public.web_catalogue_entries;
select id from public.web_template_members;
select id from public.web_templates(p_template_id=>'lt-tpl-' || :n, p_include_members=>true);
commit;
