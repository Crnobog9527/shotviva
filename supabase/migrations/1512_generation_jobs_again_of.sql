-- Make again (T40) leaves a trace (ARCHITECTURE §4, §16.2c): the work a job was made again from.
-- Null for every other job, and for every job made before this column. Set by the insert trigger
-- of 1513 only, never by a caller directly. Set null when that work is deleted, like
-- parent_job_id (0261), so the new work stays an independent work.

alter table public.generation_jobs
  add column again_of uuid references public.generation_jobs (id) on delete set null;

comment on column public.generation_jobs.again_of is
  'Make again: the caller''s own succeeded work, same template, this job was made again from (1513). Null otherwise.';

-- Serves the foreign key's own action: deleting a job (or a whole account's jobs) finds the jobs
-- made again from it through this index instead of scanning every job. Partial, since only Make
-- again jobs have one. admin_template_stats does not need it.
create index generation_jobs_again_of_idx
  on public.generation_jobs (again_of)
  where again_of is not null;
