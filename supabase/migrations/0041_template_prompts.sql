-- Private wrapped prompts (ARCHITECTURE §5, AGENTS §5). Server-only: RLS is on with no
-- policies and clients hold no grants, so anon/authenticated reads return nothing.

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
