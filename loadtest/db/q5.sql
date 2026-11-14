begin;
set local role anon;
select id from public.web_template_members;
commit;
