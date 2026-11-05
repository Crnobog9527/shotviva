-- T17: image provider settings (ARCHITECTURE §3.3). The Owner adds, tests and switches the
-- provider and model in /admin/providers; generation reads the active row. Private like
-- template_prompts: RLS on, no client role can read or write, only the service role.

create table public.ai_providers (
  id uuid primary key default gen_random_uuid(),
  -- Video gets added here when it exists.
  module text not null default 'image' check (module in ('image')),
  -- Which code adapter runs the row. A vendor with another API shape is a new adapter (code).
  adapter text not null check (adapter in ('openai_images')),
  label text not null check (char_length(label) between 1 and 80),
  -- https only; core/providers/base-url.ts also refuses localhost, private and reserved hosts.
  base_url text not null default 'https://api.openai.com/v1'
    check (base_url ~ '^https://[^\s/?#@]+(/[^\s?#]*)?$' and char_length(base_url) <= 300),
  model text not null check (char_length(model) between 1 and 120),
  -- AES-256-GCM with PROVIDER_SECRETS_KEY, encrypted and decrypted on the server only.
  api_key_ciphertext text not null check (char_length(api_key_ciphertext) between 1 and 2000),
  api_key_last4 text not null check (char_length(api_key_last4) between 1 and 4),
  is_active boolean not null default false,
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

-- At most one provider in use per module.
create unique index ai_providers_one_active_per_module on public.ai_providers (module) where is_active;

create trigger ai_providers_set_updated_at
  before update on public.ai_providers
  for each row execute function public.set_updated_at();

alter table public.ai_providers enable row level security;

revoke all on public.ai_providers from anon, authenticated;
grant select, insert, update, delete on public.ai_providers to service_role;

-- Switches the module's provider in one transaction. Locking every row of the module first
-- serialises two concurrent switches, so the partial unique index never sees two active rows.
create function public.admin_activate_provider(p_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_module text;
begin
  select module into v_module from public.ai_providers where id = p_id;
  if not found then
    raise exception 'PROVIDER_NOT_FOUND';
  end if;

  perform 1 from public.ai_providers where module = v_module order by id for update;

  update public.ai_providers set is_active = false where module = v_module and is_active and id <> p_id;
  update public.ai_providers set is_active = true where id = p_id and not is_active;
end;
$$;

revoke execute on function public.admin_activate_provider(uuid) from public, anon, authenticated;
grant execute on function public.admin_activate_provider(uuid) to service_role;
