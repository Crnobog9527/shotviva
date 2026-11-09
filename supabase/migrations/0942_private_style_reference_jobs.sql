-- Preserve older deployments' select(*) for pre-T97 jobs. Raw rows that actually carry
-- private keys are service-only; owner-facing server queries project out those keys.
create policy generation_jobs_hide_style_refs on public.generation_jobs as restrictive
  for select to authenticated using (
    not inputs ? 'style_ref_keys' or inputs->'style_ref_keys' = '[]'::jsonb
  );
