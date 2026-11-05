-- generation_jobs (T2) stores template_id as text without a constraint until templates
-- existed. Restrict deletes: a template that has jobs is unpublished, never removed.
alter table public.generation_jobs
  add constraint generation_jobs_template_id_fkey
  foreign key (template_id) references public.templates (id) on delete restrict;

create index generation_jobs_template_id_idx on public.generation_jobs (template_id);
