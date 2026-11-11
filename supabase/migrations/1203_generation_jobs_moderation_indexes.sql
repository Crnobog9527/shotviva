-- T108 (ARCHITECTURE §9.1): the three reads the gallery and its review page make. Partial, so
-- private, failed and deleted works add nothing to them.

-- /gallery pages and the work page: approved public works, newest decision first.
create index generation_jobs_gallery_idx on public.generation_jobs (moderated_at desc, id desc)
  where status = 'succeeded' and visibility = 'public' and moderation_status = 'approved'
    and deleted_at is null and source = 'web' and template_id <> 'freeform';

-- The review queue and the automatic screen's sweep: public works still waiting.
create index generation_jobs_moderation_queue_idx on public.generation_jobs (created_at, id)
  where status = 'succeeded' and visibility = 'public' and moderation_status = 'pending' and deleted_at is null;

-- The review page's approved / rejected tabs.
create index generation_jobs_moderated_idx on public.generation_jobs (moderation_status, moderated_at desc)
  where moderated_at is not null;
