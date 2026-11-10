-- Publication adds the run FK once the prompt lab exists. The library can count sources now.
create table public.reference_template_sources (
  template_id text primary key references public.templates(id) on delete cascade,
  asset_id uuid not null references public.reference_assets(id) on delete cascade,
  run_id uuid not null unique
);
create index reference_template_sources_asset on public.reference_template_sources(asset_id);
alter table public.reference_template_sources enable row level security;
revoke all on public.reference_template_sources from public,anon,authenticated;
grant select,insert,update,delete on public.reference_template_sources to service_role;
