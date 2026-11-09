-- T92: check template references while holding the existing provider lock.
create or replace function public.admin_delete_provider(p_id uuid)
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

  if exists (select 1 from public.template_prompts where provider_id = p_id) then
    raise exception 'PROVIDER_REFERENCED' using errcode = '23503';
  end if;

  delete from public.ai_providers where id = p_id;
  delete from vault.secrets where name = 'shotviva.provider.' || p_id::text;
end;
$$;
