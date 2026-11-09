-- A template can point to an inactive provider. The foreign key keeps it alive and the
-- shared lock serializes the module check with concurrent edits to the provider row.
alter table public.template_prompts add column provider_id uuid references public.ai_providers(id) on delete restrict;
create index template_prompts_provider_idx on public.template_prompts(provider_id) where provider_id is not null;

create function public.check_template_image_provider() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform 1 from public.ai_providers where id = new.provider_id and module = 'image' for share;
  if not found then
    raise exception 'PROVIDER_NOT_IMAGE' using errcode = '23503';
  end if;
  return new;
end;
$$;
create trigger template_prompts_check_image_provider before insert or update of provider_id on public.template_prompts
  for each row when (new.provider_id is not null) execute function public.check_template_image_provider();

create function public.check_referenced_provider_module() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.template_prompts where provider_id = old.id) then
    raise exception 'PROVIDER_REFERENCED' using errcode = '23503';
  end if;
  return new;
end;
$$;
create trigger ai_providers_check_references before update of module on public.ai_providers
  for each row when (old.module = 'image' and new.module <> 'image') execute function public.check_referenced_provider_module();

revoke all on function public.check_template_image_provider(), public.check_referenced_provider_module() from public, anon, authenticated;
