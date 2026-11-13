-- Dense-text posters (ARCHITECTURE §5.3 整理内容): one row per call that turns pasted text into
-- content blocks. It bounds how often one account may call the model (the route counts the last
-- hour) and records the real token use and cost per call, so pricing uses measured numbers (T33).
-- Never the text itself. Private: service role only.
create table public.poster_extractions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  source text not null check (source in ('paste', 'photo')),
  input_chars integer not null check (input_chars >= 0),
  status text not null check (status in ('ok', 'failed')),
  provider text,
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  cost_usd numeric(10, 6) check (cost_usd >= 0),
  created_at timestamptz not null default now()
);

create index poster_extractions_user_created on public.poster_extractions (user_id, created_at desc);

alter table public.poster_extractions enable row level security;

revoke all on public.poster_extractions from anon, authenticated;
grant select, insert on public.poster_extractions to service_role;
