-- Dense-text posters (ARCHITECTURE §5.3): one confirmed set of poster text and how it was split
-- into posters. Each poster is then an ordinary generation job whose inputs.poster points here,
-- so the prompt is rebuilt from what the user confirmed, never from text the browser resends.
-- A set never changes after it is saved: editing the text saves a new set, and every job keeps
-- the exact text it was made from. Owners read their own sets; only the server writes.
create table public.poster_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  template_id text not null references public.templates (id) on delete cascade,
  source text not null default 'paste' check (source in ('paste', 'photo', 'reuse', 'manual')),
  content jsonb not null check (jsonb_typeof(content) = 'object' and pg_column_size(content) <= 65536),
  parts jsonb not null check (jsonb_typeof(parts) = 'array' and jsonb_array_length(parts) between 1 and 12),
  created_at timestamptz not null default now()
);

create index poster_sets_user_created on public.poster_sets (user_id, created_at desc);

alter table public.poster_sets enable row level security;

create policy poster_sets_read_own on public.poster_sets
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.poster_sets from anon, authenticated;
grant select on public.poster_sets to authenticated;
grant select, insert, delete on public.poster_sets to service_role;
