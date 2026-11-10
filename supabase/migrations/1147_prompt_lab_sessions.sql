-- One continuing workspace per reference, private even when a result becomes a template.
create table public.prompt_lab_sessions (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null unique references public.reference_assets(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index prompt_lab_sessions_creator on public.prompt_lab_sessions(created_by) where created_by is not null;
alter table public.prompt_lab_sessions enable row level security;
revoke all on public.prompt_lab_sessions from public,anon,authenticated;
grant select,insert,update,delete on public.prompt_lab_sessions to service_role;

-- Match the asset -> session lock order used by cascading permanent deletion.
create function admin.lock_prompt_lab(p_session_id uuid) returns void
language plpgsql set search_path='' as $$
begin
  perform 1 from public.reference_assets a join public.prompt_lab_sessions s on s.asset_id=a.id
    where s.id=p_session_id and a.status='active' for share of a;
  if not found then raise exception 'PROMPT_LAB_UNAVAILABLE'; end if;
  perform 1 from public.prompt_lab_sessions where id=p_session_id for update;
end $$;
revoke all on function admin.lock_prompt_lab(uuid) from public,anon,authenticated;
grant execute on function admin.lock_prompt_lab(uuid) to service_role;
