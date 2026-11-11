-- T108 (ARCHITECTURE §9 第 5 条, §9.1): every public work is screened before any public page shows
-- it. New columns only, all with defaults, so the live code keeps working. Existing rows become
-- 'pending', which puts every public work already made into the review queue (the backfill).
alter table public.generation_jobs
  add column moderation_status text not null default 'pending'
    constraint generation_jobs_moderation_status_check check (moderation_status in ('pending', 'approved', 'rejected')),
  add column moderation_reason text
    constraint generation_jobs_moderation_reason_check check (moderation_reason in
      ('auto', 'sexual', 'violence', 'hate', 'minor', 'privacy', 'ip', 'spam', 'quality', 'other')),
  add column moderation_categories text[] not null default '{}',
  add column auto_moderated_at timestamptz,
  add column moderated_at timestamptz,
  add column moderated_by uuid references public.profiles (id) on delete set null,
  -- Failed automatic screens (no file, an API error): the sweep backs off and stops after a few,
  -- leaving the work pending for a person, so failures never starve the backfill.
  add column screen_attempts integer not null default 0
    constraint generation_jobs_screen_attempts_check check (screen_attempts >= 0),
  add column last_screen_at timestamptz;
