create function public.admin_set_code_active(p_actor uuid, p_code_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'admin' and banned_at is null) then
    raise exception 'NOT_ADMIN';
  end if;
  if p_active is null then raise exception 'INVALID_INPUT'; end if;
  update public.codes set active = p_active, updated_at = now() where id = p_code_id;
  if not found then raise exception 'CODE_NOT_FOUND'; end if;
  insert into public.admin_audit_log(action, user_id, target_id, reason)
  values ('set_code_active', p_actor, p_code_id::text, case when p_active then '启用' else '停用' end);
end;
$$;
revoke all on function public.admin_set_code_active(uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.admin_set_code_active(uuid,uuid,boolean) to service_role;
