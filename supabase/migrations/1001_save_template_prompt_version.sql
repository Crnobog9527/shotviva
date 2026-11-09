-- Original save (and all existing pricing / reference guards) inside the CAS transaction.
create or replace function public.admin_save_versioned_template(
  p_actor uuid,p_template jsonb,p_prompt jsonb,p_expected integer,p_selected integer default null,p_style_refs jsonb default null
) returns integer language plpgsql set search_path='' as $$
declare v_id text:=p_template->>'id'; current_v integer; h public.template_prompt_versions%rowtype;
  previous text:=current_setting('shotviva.restore_prompt_version',true);
begin
  if not exists(select from public.profiles where id=p_actor and role='admin' and banned_at is null) then raise exception 'FORBIDDEN'; end if;
  perform 1 from public.templates where id=v_id for update;
  if not found then raise exception 'TEMPLATE_NOT_FOUND'; end if;
  select version into current_v from public.template_prompts where template_id=v_id for update;
  if current_v is distinct from p_expected then raise exception 'STALE_PROMPT'; end if;
  if p_selected is not null then
    select * into h from public.template_prompt_versions where template_id=v_id and version=p_selected;
    if not found then raise exception 'VERSION_NOT_FOUND'; end if;
    if h.provider_id is not null and (p_prompt->>'provider_id')::uuid=h.provider_id then
      perform 1 from public.ai_providers where id=h.provider_id and module='image' and model=h.provider_model
        and vault_secret_id is not null for share;
      if not found then raise exception 'HISTORICAL_PROVIDER_UNAVAILABLE'; end if;
    end if;
  end if;
  perform set_config('shotviva.restore_prompt_version',coalesce(p_selected::text,''),true);
  if p_style_refs is null then perform public.admin_upsert_template(p_template,p_prompt);
  else perform public.admin_upsert_template(p_template,p_prompt,p_style_refs); end if;
  perform set_config('shotviva.restore_prompt_version',coalesce(previous,''),true);
  select version into strict current_v from public.template_prompts where template_id=v_id;
  return current_v;
end $$;
revoke all on function public.admin_save_versioned_template(uuid,jsonb,jsonb,integer,integer,jsonb) from public,anon,authenticated;
grant execute on function public.admin_save_versioned_template(uuid,jsonb,jsonb,integer,integer,jsonb) to service_role;
