-- PR-1b (1K / 2K / 4K by model): an OpenAI model the code's table does not know opens 1K only;
-- an admin may declare more tiers for it, and that declaration is audited in the same transaction
-- as the save. Widens the audit actions with provider_declare_tiers: the list is every action on main
-- when this lands (1401's, with template_delete) plus the new value; a later migration that rebuilds
-- this constraint must keep all of them. admin_save_provider is 0921's body unchanged except the
-- audit insert before it returns. Deployed code sends no declared_resolutions, so nothing changes for it.
alter table public.admin_audit_log drop constraint admin_audit_log_action_check,
  add constraint admin_audit_log_action_check check (action in (
  'ban_user','unban_user','view_work','replay_checkout','decide_refund','submit_dispute',
  'clawback_payment','save_code','set_code_active','affiliate_create','affiliate_decide',
  'affiliate_set','affiliate_rebind','affiliate_adjust','affiliate_commission_release',
  'affiliate_payout_decide','affiliate_settings','affiliate_recompute','waffo_renewal_settled',
  'waffo_renewal_refunded','catalog_save','catalog_prepare','catalog_publish','catalog_retry',
  'catalog_archive','catalog_waffo','gallery_setting','moderate_work','template_sync_active',
  'template_sync_sale','series_sync_active','template_apply_active','template_apply_cover',
  'series_set_active','series_set_show_members','template_delete','provider_declare_tiers'));

create or replace function public.admin_save_provider(p_actor uuid,p_id uuid,p_settings jsonb,p_capabilities jsonb,p_key text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_id uuid;
  v_tiers text[] := array(select jsonb_array_elements_text(p_capabilities->'resolutions'));
  v_declared text;
begin
  if not exists (select 1 from public.profiles where id=p_actor and role='admin' and banned_at is null) then
    raise exception 'ADMIN_REQUIRED' using errcode='42501';
  end if;
  if p_settings->>'module'='image' and (jsonb_typeof(p_capabilities->'originalRatio') is distinct from 'boolean'
     or jsonb_typeof(p_capabilities->'aspectRatios') is distinct from 'array'
     or jsonb_typeof(p_capabilities->'maxReferences') is distinct from 'number'
     or jsonb_typeof(p_capabilities->'minReferences') is distinct from 'number'
     or (p_capabilities->>'fetchedAt')::timestamptz is null) then
    raise exception 'INVALID_PROVIDER_CAPABILITIES' using errcode='23514';
  end if;
  if p_settings->>'module'='decision' then v_tiers := array['1k','2k','3k']; end if;
  if p_id is null then
    if p_key is null then raise exception 'PROVIDER_KEY_REQUIRED'; end if;
    insert into public.ai_providers (module,adapter,label,base_url,model,notes,updated_by,capabilities,resolutions,
      price_input_text_per_m,price_input_image_per_m,price_output_per_m,estimated_image_costs)
    values (p_settings->>'module',p_settings->>'adapter',p_settings->>'label',p_settings->>'base_url',p_settings->>'model',p_settings->>'notes',p_actor,
      p_capabilities,v_tiers,(p_settings->>'price_input_text_per_m')::numeric,(p_settings->>'price_input_image_per_m')::numeric,
      (p_settings->>'price_output_per_m')::numeric,coalesce(p_settings->'estimated_image_costs','{}')) returning id into v_id;
  else
    update public.ai_providers set label=p_settings->>'label',base_url=p_settings->>'base_url',model=p_settings->>'model',
      notes=p_settings->>'notes',updated_by=p_actor,capabilities=p_capabilities,resolutions=v_tiers,
      estimated_image_costs=coalesce(p_settings->'estimated_image_costs', case when model=p_settings->>'model' and base_url=p_settings->>'base_url' then estimated_image_costs else '{}'::jsonb end),
      price_input_text_per_m=(p_settings->>'price_input_text_per_m')::numeric,
      price_input_image_per_m=(p_settings->>'price_input_image_per_m')::numeric,price_output_per_m=(p_settings->>'price_output_per_m')::numeric
    where id=p_id and module=p_settings->>'module' and adapter=p_settings->>'adapter' returning id into v_id;
    if not found then raise exception 'PROVIDER_NOT_FOUND'; end if;
  end if;
  if p_key is not null then perform public.admin_set_provider_key(v_id,p_key); end if;
  -- An admin's declaration of tiers beyond the model table: one audit row per save that carries it.
  if jsonb_typeof(p_settings->'declared_resolutions')='array' and jsonb_array_length(p_settings->'declared_resolutions')>0 then
    select string_agg(upper(t),' / ' order by t) into v_declared from jsonb_array_elements_text(p_settings->'declared_resolutions') t;
    insert into public.admin_audit_log(action,user_id,reason,target_id)
    values ('provider_declare_tiers',p_actor,format('%s: declared %s beyond the model table',p_settings->>'model',v_declared),v_id::text);
  end if;
  return v_id;
end;
$$;
