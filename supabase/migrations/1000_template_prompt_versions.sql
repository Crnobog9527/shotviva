-- #400: template_prompts stays the only effective configuration read by generation.
create table public.template_prompt_versions (
  template_id text not null references public.templates(id) on delete cascade,
  version integer not null check (version > 0), body text not null, model_params jsonb not null,
  provider_id uuid, provider_model text, style_refs jsonb not null, created_at timestamptz not null,
  primary key (template_id,version)
);
alter table public.template_prompt_versions enable row level security;
revoke all on public.template_prompt_versions from public,anon,authenticated,service_role;
grant select on public.template_prompt_versions to service_role;

create or replace function admin.assign_template_prompt_version() returns trigger
language plpgsql security definer set search_path='' as $$
declare wanted integer := nullif(current_setting('shotviva.restore_prompt_version',true),'')::integer;
  h public.template_prompt_versions%rowtype; latest integer;
begin
  -- Runs after both legacy BEFORE triggers, once their resolved refs and version bump are known.
  if tg_op='UPDATE' then
    if wanted is not null then
      select * into strict h from public.template_prompt_versions where template_id=new.template_id and version=wanted;
      if (h.body,h.model_params,h.provider_id,h.style_refs) is not distinct from
         (new.body,new.model_params,new.provider_id,new.style_refs) then
        new.version:=wanted; new.updated_at:=now(); return new;
      end if;
    end if;
    if new.version=old.version and new.provider_id is not distinct from old.provider_id then return new; end if;
  end if;
  select max(version) into latest from public.template_prompt_versions where template_id=new.template_id;
  new.version:=coalesce(latest+1,new.version); new.updated_at:=now();
  return new;
end $$;
revoke all on function admin.assign_template_prompt_version() from public,anon,authenticated,service_role;
create trigger zz_template_prompt_version before insert or update on public.template_prompts
for each row execute function admin.assign_template_prompt_version();

create or replace function admin.archive_template_prompt_version() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and new.version=old.version then return null; end if;
  -- A restore already has its immutable snapshot. All other writes insert a new PK.
  if new.version=nullif(current_setting('shotviva.restore_prompt_version',true),'')::integer then return null; end if;
  insert into public.template_prompt_versions(template_id,version,body,model_params,provider_id,provider_model,style_refs,created_at)
    values (new.template_id,new.version,new.body,new.model_params,new.provider_id,
      (select model from public.ai_providers where id=new.provider_id),new.style_refs,new.updated_at);
  return null;
end $$;
revoke all on function admin.archive_template_prompt_version() from public,anon,authenticated,service_role;
create trigger archive_template_prompt_version after insert or update on public.template_prompts
for each row execute function admin.archive_template_prompt_version();

insert into public.template_prompt_versions(template_id,version,body,model_params,provider_id,provider_model,style_refs,created_at)
select p.template_id,p.version,p.body,p.model_params,p.provider_id,a.model,p.style_refs,p.updated_at
from public.template_prompts p left join public.ai_providers a on a.id=p.provider_id;
