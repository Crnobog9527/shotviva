-- expect: none
-- drop table public.profiles; delete from public.payments; truncate public.credit_ledger;
/* alter table public.templates drop column title;
   /* nested: update public.profiles set credits = 0; */
   alter table public.templates rename to old_templates; */
comment on table public.templates is 'Never drop table templates; delete from it only via admin; update x set y';
comment on column public.templates.title is E'It''s fine: \' drop column title; truncate x \'';
insert into public.system_settings (key, value) values ('maintenance', '"drop table profiles"'::jsonb)
  on conflict (key) do update set value = excluded.value;
select pg_notify('jobs', 'delete from public.generation_jobs');
