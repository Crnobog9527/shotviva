-- Serves the 30-day p95 of one route at one resolution (alternate_route_meets_floor, 1252):
-- the same rows admin_image_provider_pricing() samples, without the quality key that
-- generation_jobs_route_cost_idx requires. cost_usd is included for an index-only scan.
create index generation_jobs_route_p95_idx on public.generation_jobs
  (provider, (coalesce(inputs->>'resolution','1k')), created_at) include (cost_usd)
  where status='succeeded' and cost_usd is not null;
