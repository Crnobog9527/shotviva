-- Baseline (T15): templates (ARCHITECTURE §5). The public catalogue is safe to show to
-- anyone; the wrapped prompts live in template_prompts, which clients can never read.

create table public.templates (
  -- Text slugs so generation_jobs.template_id (text) can reference them, e.g. 'freeform'.
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(id) <= 64),
  module text not null default 'image' check (module in ('image', 'video')),
  name text not null check (char_length(name) between 1 and 120),
  category text not null check (char_length(category) between 1 and 60),
  cover_before_url text,
  cover_after_url text,
  -- Field definitions (images, copy fields, aspect ratios); shape is validated in core/templates.
  fields jsonb not null default '{}'::jsonb check (jsonb_typeof(fields) = 'object'),
  credits_cost integer not null default 2 check (credits_cost > 0),
  sort_order integer not null default 0,
  is_active boolean not null default false,
  -- Which entry points list the template: Shotviva's own site ('web') and/or partners ('partner').
  visible_in text[] not null default array['web']::text[]
    check (cardinality(visible_in) > 0 and visible_in <@ array['web', 'partner']::text[]),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index templates_active_sort_idx on public.templates (sort_order, id) where is_active;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger templates_set_updated_at
  before update on public.templates
  for each row execute function public.set_updated_at();

alter table public.templates enable row level security;

-- Anyone (signed in or not) can read published templates; unpublished rows stay hidden.
create policy templates_select_active on public.templates
  for select to anon, authenticated
  using (is_active);

-- Local config does not auto-expose new tables, so grants are explicit. No client writes.
grant select on public.templates to anon, authenticated;
grant all on public.templates to service_role;

-- Private wrapped prompts (AGENTS §5). Server-only: RLS is on with no policies and clients
-- hold no grants, so anon/authenticated reads return nothing.
create table public.template_prompts (
  template_id text primary key references public.templates (id) on delete cascade,
  body text not null check (char_length(body) > 0),
  -- Bumped whenever the body or model params change, so jobs can record which prompt ran.
  version integer not null default 1 check (version > 0),
  model_params jsonb not null default '{}'::jsonb check (jsonb_typeof(model_params) = 'object'),
  updated_at timestamptz not null default now()
);

create function public.bump_template_prompt_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.body is distinct from old.body or new.model_params is distinct from old.model_params then
    new.version := old.version + 1;
    new.updated_at := now();
  else
    new.version := old.version;
  end if;
  return new;
end;
$$;

create trigger template_prompts_bump_version
  before update on public.template_prompts
  for each row execute function public.bump_template_prompt_version();

alter table public.template_prompts enable row level security;

revoke all on public.template_prompts from anon, authenticated;
grant all on public.template_prompts to service_role;

-- Built-in freeform template: free-text generation shares the template code path.
-- Partner-only, because Shotviva's own UI never shows a prompt box (DESIGN).
-- The pass-through body is not a crafted prompt, so it is safe to keep in git.
insert into public.templates (id, module, name, category, fields, credits_cost, sort_order, is_active, visible_in)
values (
  'freeform',
  'image',
  'Freeform',
  'freeform',
  '{
    "images": { "min": 0, "max": 1 },
    "copy": [{ "key": "prompt", "label": "Prompt", "required": true, "maxLength": 2000 }],
    "aspectRatios": ["1:1", "4:5", "3:4", "9:16", "16:9"]
  }'::jsonb,
  1,
  0,
  true,
  array['partner']::text[]
);

insert into public.template_prompts (template_id, body)
values ('freeform', '{{prompt}}');
