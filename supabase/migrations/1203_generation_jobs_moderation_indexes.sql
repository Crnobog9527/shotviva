-- T108 (ARCHITECTURE §9.1): the reads the gallery and its review page make. Partial, so private,
-- failed and deleted works add nothing to them. The gallery's scope (§9 第 7 条) is web works of
-- a template other than freeform and edit.

-- /gallery pages and the work page: approved public works, newest decision first.
create index generation_jobs_gallery_idx on public.generation_jobs (moderated_at desc, id desc)
  where status = 'succeeded' and visibility = 'public' and moderation_status = 'approved'
    and deleted_at is null and source = 'web' and template_id <> 'freeform' and template_id <> 'edit';

-- The review queue: public works in scope still waiting for a person.
create index generation_jobs_moderation_queue_idx on public.generation_jobs (created_at, id)
  where status = 'succeeded' and visibility = 'public' and moderation_status = 'pending' and deleted_at is null
    and source = 'web' and template_id <> 'freeform' and template_id <> 'edit';

-- The automatic screen's sweep: works not screened yet, never tried first, then the least
-- recently tried (failures back off and stop after a few attempts).
create index generation_jobs_screen_sweep_idx on public.generation_jobs (last_screen_at nulls first, created_at)
  where status = 'succeeded' and visibility = 'public' and moderation_status = 'pending' and deleted_at is null
    and auto_moderated_at is null and source = 'web' and template_id <> 'freeform' and template_id <> 'edit';

-- The review page's approved / rejected tabs.
create index generation_jobs_moderated_idx on public.generation_jobs (moderation_status, moderated_at desc)
  where moderated_at is not null;
