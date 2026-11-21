-- Where an enterprise customer sends its offline wire (ARCHITECTURE §6.5). Enterprise packages are
-- paid by company-to-company bank transfer, never through Stripe; the platform admin fills our
-- two receiving accounts here and the org owner's package section shows the enabled ones.
-- Two groups, fixed keys: overseas_us (a US company's business account) and mainland_agent (a
-- mainland-China collection agent's account). The real values live only in each database: private
-- table, RLS on, no policy, no client grant; the service role reads; writes go through
-- admin_org_payment_account_save, reads for an owner through org_payment_accounts_for_owner.

create table public.org_payment_accounts (
  kind text primary key check (kind in ('overseas_us','mainland_agent')),
  enabled boolean not null default false,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id)
);
alter table public.org_payment_accounts enable row level security;
revoke all on public.org_payment_accounts from public, anon, authenticated, service_role;
grant select on public.org_payment_accounts to service_role;

-- The fields each group may carry. Anything else is refused, so nothing unexpected is stored or
-- shown to customers.
create or replace function public._org_payment_fields(p_kind text) returns text[]
language sql immutable set search_path = '' as $$
  select case p_kind
    when 'overseas_us' then array['account_name','bank_name','account_number','routing_aba','swift','bank_address','beneficiary_address','currency','notes']
    when 'mainland_agent' then array['account_name','bank_name','branch','account_number','swift','address','currency','remittance_note','notes']
  end;
$$;
revoke all on function public._org_payment_fields(text) from public, anon, authenticated, service_role;

-- Save one group. details: an object of the allowed text fields (blank ones are dropped, each
-- value at most 1000 characters); enabling needs the account name, bank name and account number.
-- A first save has no expected_updated_at; later saves must pass the row's current one (a stale
-- form is ORG_CHANGED). The audit entry records only the group and the switch, never the values.
create or replace function public.admin_org_payment_account_save(p_actor uuid, p_input jsonb) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_kind text := p_input->>'kind';
  v_allowed text[] := public._org_payment_fields(p_input->>'kind');
  v_enabled boolean;
  v_details jsonb := '{}'::jsonb;
  v_old public.org_payment_accounts;
  v_new public.org_payment_accounts;
  k text;
  v text;
begin
  perform public._org_require_admin(p_actor);
  if v_allowed is null or jsonb_typeof(p_input->'enabled') is distinct from 'boolean'
     or jsonb_typeof(p_input->'details') is distinct from 'object' then
    raise exception 'INVALID_INPUT';
  end if;
  v_enabled := (p_input->>'enabled')::boolean;
  for k in select jsonb_object_keys(p_input->'details') loop
    if not (k = any(v_allowed)) or jsonb_typeof(p_input->'details'->k) <> 'string' then
      raise exception 'INVALID_INPUT' using detail = k;
    end if;
    v := trim(p_input->'details'->>k);
    if length(v) > 1000 then raise exception 'INVALID_INPUT' using detail = k; end if;
    if v <> '' then v_details := v_details || jsonb_build_object(k, v); end if;
  end loop;
  if v_enabled and not (v_details ? 'account_name' and v_details ? 'bank_name' and v_details ? 'account_number') then
    raise exception 'INVALID_INPUT' using detail = 'required';
  end if;
  select * into v_old from public.org_payment_accounts where kind = v_kind for update;
  if found then
    if (p_input->>'expected_updated_at') is null
       or (p_input->>'expected_updated_at')::timestamptz is distinct from v_old.updated_at then
      raise exception 'ORG_CHANGED';
    end if;
    update public.org_payment_accounts set enabled = v_enabled, details = v_details, updated_at = now(), updated_by = p_actor
      where kind = v_kind returning * into v_new;
  else
    if (p_input->>'expected_updated_at') is not null then raise exception 'ORG_CHANGED'; end if;
    insert into public.org_payment_accounts(kind, enabled, details, updated_by) values (v_kind, v_enabled, v_details, p_actor)
      on conflict (kind) do nothing returning * into v_new;
    if not found then raise exception 'ORG_CHANGED'; end if;
  end if;
  perform public._org_audit(p_actor, 'org_update', 'payment_account:' || v_kind, 'payment_account enabled:' || v_enabled::text);
  return v_new.updated_at;
end;
$$;
revoke all on function public.admin_org_payment_account_save(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.admin_org_payment_account_save(uuid, jsonb) to service_role;

-- The enabled groups, for the owner of an org (p_owner is the signed-in account from the server
-- session). Anyone who does not own an org, a member included, is NOT_ORG_OWNER and sees nothing.
create or replace function public.org_payment_accounts_for_owner(p_owner uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_owner is null or not exists(select from public.orgs where owner_user_id = p_owner) then
    raise exception 'NOT_ORG_OWNER';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('kind', a.kind, 'details', a.details, 'updated_at', a.updated_at) order by a.kind)
    from public.org_payment_accounts a where a.enabled
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.org_payment_accounts_for_owner(uuid) from public, anon, authenticated, service_role;
grant execute on function public.org_payment_accounts_for_owner(uuid) to service_role;
