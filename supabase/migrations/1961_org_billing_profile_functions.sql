-- 开票信息 (1960, ARCHITECTURE §6.5): read, save and clear by the org's CURRENT primary admin
-- only, plus the checkout's read of the Waffo billingDetail. All service_role only; the server
-- passes the signed-in account's id from its session, and every function checks ownership itself
-- against orgs.owner_user_id, so an ownership transfer hands the profile to the new owner at once.

create or replace function public._org_billing_profile_json(p public.org_billing_profiles)
returns jsonb language sql immutable set search_path = '' as $$
  select case when p.org_id is null then null else jsonb_build_object(
    'legal_name', p.legal_name, 'tax_id', p.tax_id, 'country', p.country, 'postcode', p.postcode,
    'state', p.state, 'invoice_email', p.invoice_email, 'updated_at', p.updated_at) end
$$;
revoke all on function public._org_billing_profile_json(public.org_billing_profiles) from public, anon, authenticated, service_role;

-- The owner's profile, or null when none is saved yet. Anyone but the current owner: NOT_ORG_OWNER.
create or replace function public.org_billing_profile_get(p_owner uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  org uuid;
  p public.org_billing_profiles;
begin
  select id into org from public.orgs where owner_user_id = p_owner;
  if org is null then raise exception 'NOT_ORG_OWNER'; end if;
  select * into p from public.org_billing_profiles where org_id = org;
  return public._org_billing_profile_json(p);
end;
$$;
revoke all on function public.org_billing_profile_get(uuid) from public, anon, authenticated, service_role;
grant execute on function public.org_billing_profile_get(uuid) to service_role;

-- Save (insert or replace) the owner's profile. Inputs are trimmed and blank optionals become
-- null; the tax ID is upper-cased without spaces, and for China it must be an 18-character
-- 统一社会信用代码. Anything else out of shape: INVALID_INPUT. A suspended org may still save
-- (the company's details do not depend on the org's status). Writes one event row.
create or replace function public.org_billing_profile_save(
  p_owner uuid, p_legal_name text, p_tax_id text, p_country text,
  p_postcode text default null, p_state text default null, p_invoice_email text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  o public.orgs;
  v_name text := regexp_replace(btrim(coalesce(p_legal_name, '')), '\s+', ' ', 'g');
  v_tax text := upper(regexp_replace(coalesce(p_tax_id, ''), '\s', '', 'g'));
  v_country text := upper(btrim(coalesce(p_country, '')));
  v_post text := nullif(btrim(coalesce(p_postcode, '')), '');
  v_state text := nullif(btrim(coalesce(p_state, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_invoice_email, ''))), '');
  p public.org_billing_profiles;
  result jsonb;
begin
  o := public._org_lock_owned(p_owner, true);
  -- Only the places the form offers; Waffo wants a state code (CA, NY, NSW, ON) where the
  -- country needs one, so those three require it.
  if v_country not in ('CN','HK','MO','TW','SG','MY','JP','KR','US','GB','AU','CA','DE','FR')
     or (v_country = 'CN' and v_tax !~ '^[0-9A-HJ-NPQRTUWXY]{2}[0-9]{6}[0-9A-HJ-NPQRTUWXY]{10}$')
     or (v_country in ('US','CA','AU') and coalesce(upper(v_state), '') !~ '^[A-Z]{2,3}$') then
    raise exception 'INVALID_INPUT';
  end if;
  if v_country in ('US','CA','AU') then v_state := upper(v_state); end if;
  begin
    insert into public.org_billing_profiles as b (org_id, legal_name, tax_id, country, postcode, state, invoice_email, updated_at, updated_by)
    values (o.id, v_name, v_tax, v_country, v_post, v_state, v_email, now(), p_owner)
    on conflict (org_id) do update set legal_name = excluded.legal_name, tax_id = excluded.tax_id,
      country = excluded.country, postcode = excluded.postcode, state = excluded.state,
      invoice_email = excluded.invoice_email, updated_at = excluded.updated_at, updated_by = excluded.updated_by
    returning * into p;
  exception when check_violation or not_null_violation then
    raise exception 'INVALID_INPUT';
  end;
  result := public._org_billing_profile_json(p);
  insert into public.org_billing_profile_events (org_id, actor, action, profile)
  values (o.id, p_owner, 'save', result - 'updated_at');
  return result;
end;
$$;
revoke all on function public.org_billing_profile_save(uuid, text, text, text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.org_billing_profile_save(uuid, text, text, text, text, text, text) to service_role;

-- Remove the owner's profile: later Waffo checkouts carry no company title. Returns whether a
-- row was there; an event row is written only then.
create or replace function public.org_billing_profile_clear(p_owner uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  o public.orgs;
begin
  o := public._org_lock_owned(p_owner, true);
  delete from public.org_billing_profiles where org_id = o.id;
  if not found then return false; end if;
  insert into public.org_billing_profile_events (org_id, actor, action) values (o.id, p_owner, 'clear');
  return true;
end;
$$;
revoke all on function public.org_billing_profile_clear(uuid) from public, anon, authenticated, service_role;
grant execute on function public.org_billing_profile_clear(uuid) to service_role;

-- The checkout's read (core/billing/waffo/billing-detail.ts): the buyer's org profile when the
-- buyer is that org's CURRENT owner, else null. Never raises for a non-owner, so a purchase by
-- anyone else goes on exactly as before.
create or replace function public.org_checkout_billing_profile(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select public._org_billing_profile_json(b)
  from public.orgs o join public.org_billing_profiles b on b.org_id = o.id
  where o.owner_user_id = p_user
$$;
revoke all on function public.org_checkout_billing_profile(uuid) from public, anon, authenticated, service_role;
grant execute on function public.org_checkout_billing_profile(uuid) to service_role;
