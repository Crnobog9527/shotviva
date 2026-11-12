begin;
set local role anon;
select entry_key from public.web_catalogue_entries;
commit;
