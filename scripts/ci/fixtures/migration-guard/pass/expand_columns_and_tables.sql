-- expect: none
-- The ordinary expand migration: a new table with its own constraints, new nullable or
-- defaulted columns, a check and a unique key that only involve the new columns.
create table public.favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  template_id text not null references public.templates (id),
  created_at timestamptz not null default now(),
  primary key (user_id, template_id)
);
alter table public.favorites enable row level security;
alter table public.favorites add constraint favorites_template_id_check check (template_id <> '');
create unique index favorites_user_created_key on public.favorites (user_id, created_at);
delete from public.favorites;

alter table public.templates
  add column favorite_count integer not null default 0,
  add column hero_rank smallint check (hero_rank is null or hero_rank between 1 and 12),
  add column slug text,
  add constraint templates_favorite_count_check check (favorite_count >= 0),
  add constraint templates_slug_key unique (slug);
create unique index templates_hero_rank_key on public.templates (hero_rank) where hero_rank is not null;
alter table public.templates alter column favorite_count set default 1;
alter table public.templates alter column slug drop not null;
create index templates_slug_idx on public.templates (slug);
alter type public.job_status add value if not exists 'queued';
