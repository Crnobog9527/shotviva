create table public.prompt_lab_versions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.prompt_lab_sessions(id) on delete cascade,
  version_no integer not null check(version_no>0),
  prompt text not null check(length(prompt) between 1 and 32000 and length(btrim(prompt))>0),
  note text check(length(note)<=2000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(session_id,version_no),
  unique(session_id,id)
);
create index prompt_lab_versions_creator on public.prompt_lab_versions(created_by) where created_by is not null;
alter table public.prompt_lab_versions enable row level security;
revoke all on public.prompt_lab_versions from public,anon,authenticated;
grant select,insert,update,delete on public.prompt_lab_versions to service_role;
