-- T33: the OpenAI Admin key that /admin/costs uses to read the organization's billed costs
-- (ARCHITECTURE §10.0). Stored in Supabase Vault exactly like provider keys (0141): the admin
-- pastes it once, the page only ever sees its last four characters, and only the costs fetch
-- reads the plaintext. There is one such key, so it is a Vault secret with a fixed name and no
-- table row. The optional OpenAI project id that scopes the costs to Shotviva's project is not
-- secret but sits next to it under its own fixed name, so the setting needs no table either.

-- Stores, replaces or (p_key null) clears the Admin key. Clearing also clears the project id.
create function public.admin_set_openai_admin_key(p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $_$
declare
  v_name constant text := 'shotviva.openai_admin_key';
  v_secret uuid;
begin
  -- Same shape rule as provider keys: printable ASCII without whitespace, 16-1024 characters.
  if p_key is not null and (char_length(p_key) not between 16 and 1024 or p_key !~ '^[!-~]+$') then
    raise exception 'PROVIDER_KEY_INVALID' using errcode = '23514';
  end if;

  if p_key is null then
    delete from vault.secrets where name in (v_name, 'shotviva.openai_costs_project');
    return;
  end if;

  select id into v_secret from vault.secrets where name = v_name;
  if v_secret is null then
    perform vault.create_secret(p_key, v_name, 'Shotviva OpenAI Admin key (cost reconciliation)');
  else
    perform vault.update_secret(v_secret, p_key);
  end if;
end;
$_$;

-- Sets or (null) clears the OpenAI project id the costs are filtered by.
create function public.admin_set_openai_costs_project(p_project_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $_$
declare
  v_name constant text := 'shotviva.openai_costs_project';
  v_secret uuid;
begin
  if p_project_id is not null and p_project_id !~ '^proj_[A-Za-z0-9]{1,64}$' then
    raise exception 'INVALID_INPUT' using errcode = '23514', detail = 'project id must look like proj_…';
  end if;

  select id into v_secret from vault.secrets where name = v_name;
  if p_project_id is null then
    delete from vault.secrets where name = v_name;
  elsif v_secret is null then
    perform vault.create_secret(p_project_id, v_name, 'Shotviva OpenAI project id for cost reconciliation');
  else
    perform vault.update_secret(v_secret, p_project_id);
  end if;
end;
$_$;

-- What the admin page shows: the key's last four characters (null: no key) and the project id.
create function public.admin_openai_admin_key_status()
returns table (key_last4 text, project_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select (select right(decrypted_secret, 4) from vault.decrypted_secrets where name = 'shotviva.openai_admin_key'),
         (select decrypted_secret from vault.decrypted_secrets where name = 'shotviva.openai_costs_project');
$$;

-- The plaintext key and project id, for the costs fetch only. Null key: none stored.
create function public.openai_admin_key()
returns table (api_key text, project_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select (select decrypted_secret from vault.decrypted_secrets where name = 'shotviva.openai_admin_key'),
         (select decrypted_secret from vault.decrypted_secrets where name = 'shotviva.openai_costs_project');
$$;

revoke execute on function public.admin_set_openai_admin_key(text) from public, anon, authenticated;
revoke execute on function public.admin_set_openai_costs_project(text) from public, anon, authenticated;
revoke execute on function public.admin_openai_admin_key_status() from public, anon, authenticated;
revoke execute on function public.openai_admin_key() from public, anon, authenticated;
grant execute on function public.admin_set_openai_admin_key(text) to service_role;
grant execute on function public.admin_set_openai_costs_project(text) to service_role;
grant execute on function public.admin_openai_admin_key_status() to service_role;
grant execute on function public.openai_admin_key() to service_role;
