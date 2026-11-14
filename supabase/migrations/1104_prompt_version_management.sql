-- Deleting a version removes its private snapshot. The audit record also reserves its
-- number so earlier jobs can never be mistaken for another version after a deletion.
alter table public.template_prompt_versions add column display_name text;
create table admin.deleted_prompt_versions (
  template_id text not null references public.templates(id) on delete cascade,
  version integer not null, actor_id uuid not null, deleted_at timestamptz not null default now(),
  primary key(template_id,version)
);
alter table admin.deleted_prompt_versions enable row level security;
revoke all on admin.deleted_prompt_versions from public,anon,authenticated,service_role;

create function public.admin_manage_prompt_version(p_actor uuid,p_id text,p_version int,p_action text,p_name text default null)
returns void language plpgsql security definer set search_path='' as $$
declare active int;
begin
  if not exists(select from public.profiles where id=p_actor and role='admin' and banned_at is null) then raise exception 'FORBIDDEN'; end if;
  perform 1 from public.templates where id=p_id for update;
  select version into active from public.template_prompts where template_id=p_id for update;
  if p_action='rename' and length(coalesce(p_name,''))<=80 then
    update public.template_prompt_versions set display_name=nullif(trim(p_name),'') where template_id=p_id and version=p_version;
  elsif p_action='delete' then
    if active=p_version then raise exception 'ACTIVE_VERSION'; end if;
    delete from public.template_prompt_versions where template_id=p_id and version=p_version;
    if found then
      insert into admin.deleted_prompt_versions(template_id,version,actor_id) values(p_id,p_version,p_actor);
      return;
    end if;
  else raise exception 'INVALID_INPUT'; end if;
  if not found then raise exception 'VERSION_NOT_FOUND'; end if;
end;
$$;
revoke all on function public.admin_manage_prompt_version(uuid,text,int,text,text) from public,anon,authenticated;
grant execute on function public.admin_manage_prompt_version(uuid,text,int,text,text) to service_role;

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
  select greatest(
    (select max(version) from public.template_prompt_versions where template_id=new.template_id),
    (select max(version) from admin.deleted_prompt_versions where template_id=new.template_id)
  ) into latest;
  new.version:=coalesce(latest+1,new.version); new.updated_at:=now();
  return new;
end $$;
