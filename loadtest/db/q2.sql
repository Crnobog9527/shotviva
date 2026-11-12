begin;
set local role anon;
select id from public.web_templates();
commit;
