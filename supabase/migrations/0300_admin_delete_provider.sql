-- ARCHITECTURE §3.3 「删除供应商」: the admin deletes a provider row that is not in use. The row and
-- its Vault key go in one transaction: the delete fires ai_providers_delete_vault_secret (0141),
-- and a leftover secret under the row's name is removed too. generation_jobs.provider is a text
-- snapshot (<id>/<model>), so history and cost are untouched.
--
-- Service role only, like admin_activate_provider and admin_set_provider_key: the app checks the
-- admin role (requireAdmin) and logs admin.provider.deleted.

create function public.admin_delete_provider(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active boolean;
begin
  -- Row lock: a concurrent switch to this row waits for the delete, or the delete sees it active.
  select is_active into v_active from public.ai_providers where id = p_id for update;
  if not found then
    raise exception 'PROVIDER_NOT_FOUND';
  end if;
  -- The module would silently fall back (env, or none for decision): switch first.
  if v_active then
    raise exception 'PROVIDER_ACTIVE' using errcode = '55000';
  end if;

  delete from public.ai_providers where id = p_id;
  delete from vault.secrets where name = 'shotviva.provider.' || p_id::text;
end;
$$;

revoke execute on function public.admin_delete_provider(uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_provider(uuid) to service_role;
