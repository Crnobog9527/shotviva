-- T17b: provider API keys move into Supabase Vault (ARCHITECTURE §3.3), as Graylum does. The
-- database encrypts them; the app no longer needs PROVIDER_SECRETS_KEY. ai_providers keeps only
-- the Vault secret's id and the last four characters. The table holds no rows on preview or
-- production, so the ciphertext column is simply dropped.

-- Present on Supabase projects and local stacks already; stated so the dependency is explicit.
create extension if not exists supabase_vault with schema vault;

alter table public.ai_providers
  drop column api_key_ciphertext,
  alter column api_key_last4 drop not null,
  add column vault_secret_id uuid,
  -- A key is either fully there (Vault id + last four) or not at all.
  add constraint ai_providers_key_pair check ((vault_secret_id is null) = (api_key_last4 is null));

-- Stores, replaces or (p_key null) clears a provider's key. The Vault secret is named
-- shotviva.provider.<id>. The key is never returned.
create function public.admin_set_provider_key(p_id uuid, p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret uuid;
  v_name text := 'shotviva.provider.' || p_id::text;
begin
  -- Printable ASCII without whitespace, 16-1024 characters: every supported provider key fits.
  if p_key is not null and (char_length(p_key) not between 16 and 1024 or p_key !~ '^[!-~]+$') then
    raise exception 'PROVIDER_KEY_INVALID' using errcode = '23514';
  end if;

  select vault_secret_id into v_secret from public.ai_providers where id = p_id for update;
  if not found then
    raise exception 'PROVIDER_NOT_FOUND';
  end if;

  if p_key is null then
    delete from vault.secrets where id = v_secret or name = v_name;
    update public.ai_providers set vault_secret_id = null, api_key_last4 = null where id = p_id;
    return;
  end if;

  if v_secret is not null and exists (select 1 from vault.secrets where id = v_secret) then
    perform vault.update_secret(v_secret, p_key);
  else
    -- A leftover secret under this name is replaced, never reused blindly.
    delete from vault.secrets where name = v_name;
    v_secret := vault.create_secret(p_key, v_name, 'Shotviva image provider API key');
  end if;

  update public.ai_providers set vault_secret_id = v_secret, api_key_last4 = right(p_key, 4) where id = p_id;
end;
$$;

-- The plaintext key for generation and the connection test; null when the row has none.
create function public.provider_api_key(p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_secret uuid;
  v_key text;
begin
  select vault_secret_id into v_secret from public.ai_providers where id = p_id;
  if not found then
    raise exception 'PROVIDER_NOT_FOUND';
  end if;
  if v_secret is null then
    return null;
  end if;

  select decrypted_secret into v_key from vault.decrypted_secrets where id = v_secret;
  if v_key is null then
    raise exception 'PROVIDER_KEY_MISSING';
  end if;
  return v_key;
end;
$$;

-- Deleting a provider deletes its key in the same transaction.
create function public.delete_provider_vault_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.vault_secret_id is not null then
    delete from vault.secrets where id = old.vault_secret_id;
  end if;
  return old;
end;
$$;

create trigger ai_providers_delete_vault_secret
  after delete on public.ai_providers
  for each row execute function public.delete_provider_vault_secret();

revoke execute on function public.admin_set_provider_key(uuid, text) from public, anon, authenticated;
revoke execute on function public.provider_api_key(uuid) from public, anon, authenticated;
revoke execute on function public.delete_provider_vault_secret() from public, anon, authenticated;
grant execute on function public.admin_set_provider_key(uuid, text) to service_role;
grant execute on function public.provider_api_key(uuid) to service_role;
