-- T82: per-work evidence that the buyer used what they paid for. client_ip: the request that
-- started the generation or edit on the website (null for Graylum partner calls, whose IP is
-- Graylum's server). downloaded_at / download_ip: the first explicit download (?download=1);
-- download_count counts them all. Written by reserve_credits (0723) and record_job_download
-- (0724) only. Purpose disclosed in the privacy policy (fraud prevention and disputes); the rows
-- go when the work's account is deleted, like the work itself.
alter table public.generation_jobs
  add column client_ip inet,
  add column downloaded_at timestamptz,
  add column download_ip inet,
  add column download_count integer not null default 0,
  add constraint generation_jobs_download_count_check check (download_count >= 0);
