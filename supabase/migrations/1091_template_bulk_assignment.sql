-- Check the entire T79 patch before assigning any subcategory. The root and
-- legacy English name are maintained by the original bulk RPC and T75 trigger.
create function public.admin_bulk_assign_templates(
  p_ids text[], p_patch jsonb, p_floor jsonb, p_actor uuid, p_locales text[]
) returns jsonb language plpgsql set search_path = '' as $$
declare
  v_node text := p_patch->>'category_key';
  v_root text;
  v_result jsonb;
begin
  if not exists(select from public.profiles where id=p_actor and role='admin' and banned_at is null) then
    raise exception 'NOT_ADMIN';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.category_tree',0));
  select p.root_key into v_root from public.template_category_paths p
    join public.template_categories c on c.key=p.key where p.key=v_node and not c.is_system;
  if not found then raise exception 'CATEGORY_NOT_FOUND'; end if;
  v_result:=public.admin_bulk_edit_templates(p_ids,jsonb_set(p_patch,'{category_key}',to_jsonb(v_root)),p_floor,p_actor,p_locales);
  if v_result->'failures'='[]'::jsonb then
    update public.templates set subcategory_key=nullif(v_node,v_root)
      where id=any(p_ids) and subcategory_key is distinct from nullif(v_node,v_root);
  end if;
  return v_result;
end $$;
revoke all on function public.admin_bulk_assign_templates(text[],jsonb,jsonb,uuid,text[]) from public,anon,authenticated;
grant execute on function public.admin_bulk_assign_templates(text[],jsonb,jsonb,uuid,text[]) to service_role;
