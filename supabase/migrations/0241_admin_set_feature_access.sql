-- T29: the /admin/features save (ARCHITECTURE §6.2). One upsert per save; the admin's id goes
-- into updated_by. Whether p_key is a registered feature is checked by the server first: the
-- registry lives in code, not in the database.

create function public.admin_set_feature_access(
  p_key text,
  p_min_tier text,
  p_open_to_all_at timestamptz,
  p_actor uuid
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_actor is null then
    raise exception 'INVALID_INPUT' using detail = 'actor is required';
  end if;
  if p_min_tier is not null and p_min_tier not in ('pro', 'max') then
    raise exception 'INVALID_INPUT' using detail = 'min_tier must be pro or max';
  end if;

  insert into public.feature_access (key, min_tier, open_to_all_at, updated_at, updated_by)
  values (p_key, p_min_tier, p_open_to_all_at, now(), p_actor)
  on conflict (key) do update
    set min_tier = excluded.min_tier,
        open_to_all_at = excluded.open_to_all_at,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;
end;
$$;

revoke execute on function public.admin_set_feature_access(text, text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.admin_set_feature_access(text, text, timestamptz, uuid) to service_role;
