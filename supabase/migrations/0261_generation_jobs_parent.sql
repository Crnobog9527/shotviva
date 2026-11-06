-- T30: an edited photo points at the work it was edited from (ARCHITECTURE §4, §5.2). Set null
-- when that work is deleted, so the edit stays an independent work.

alter table public.generation_jobs
  add column parent_job_id uuid references public.generation_jobs (id) on delete set null;

-- Serves the foreign key's own action: deleting a job (or a whole account's jobs) finds the
-- edits that point at it through this index instead of scanning every job. Partial, since only
-- edits have a parent.
create index generation_jobs_parent_job_id_idx
  on public.generation_jobs (parent_job_id)
  where parent_job_id is not null;
