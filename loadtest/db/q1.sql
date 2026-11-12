begin;
set local role anon;
select id from public.web_templates(p_template_id=>'lt-tpl-1', p_include_members=>true);
commit;
