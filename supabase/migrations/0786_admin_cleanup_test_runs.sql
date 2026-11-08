-- T85: tidies admin test runs when the panel opens (ARCHITECTURE §10.b 「隔离」: no scheduled job).
-- In one transaction:
--   * a run still 'running' after 10 minutes died with its function: failed / TIMEOUT;
--   * runs older than 30 days, and each template's runs beyond its newest 50, are deleted unless
--     they were set as a cover (their children's parent_id goes null, 0781);
--   * test photos not used for 30 days are deleted unless a cover run started from them;
--   * spend rows (0782) older than 100 days are dropped (/admin/costs reads at most 90). Younger
--     ones stay whatever happens to their run, so a trim never gives budget back.
-- Returns {"keys": [...]}: the R2 objects of what was deleted, for the caller to remove from the
-- private bucket (best effort; a key it misses only costs storage). Only an admin may call it.
-- Indexes: admin_test_runs_created_at_idx, admin_test_runs_template_created_idx,
-- admin_test_photos_last_used_at_idx, admin_test_spend_started_at_idx.

create function public.admin_cleanup_test_runs(p_actor uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_run_keys text[];
  v_photo_keys text[];
begin
  if p_actor is null or not exists (select 1 from public.profiles p where p.id = p_actor and p.role = 'admin') then
    raise exception 'NOT_ADMIN';
  end if;

  update public.admin_test_runs r
     set status = 'failed', error_code = 'TIMEOUT', finished_at = now()
   where r.status = 'running' and r.created_at < now() - interval '10 minutes';
  update public.admin_test_spend x
     set counted_usd = 0, finished_at = now()
   where x.counted_usd is null and x.started_at < now() - interval '10 minutes';
  delete from public.admin_test_spend x where x.started_at < now() - interval '100 days';

  with ranked as (
    select r.id, r.created_at, r.cover_set_at,
           row_number() over (partition by r.template_id order by r.created_at desc, r.id desc) as n
      from public.admin_test_runs r
  ),
  doomed as (
    delete from public.admin_test_runs r
     using ranked k
     where r.id = k.id
       and k.cover_set_at is null
       and (k.created_at < now() - interval '30 days' or k.n > 50)
    returning r.output_key
  )
  select coalesce(array_agg(d.output_key) filter (where d.output_key is not null), '{}') into v_run_keys from doomed d;

  with doomed as (
    delete from public.admin_test_photos ph
     where ph.last_used_at < now() - interval '30 days'
       and not exists (select 1 from public.admin_test_runs r where r.photo_id = ph.id and r.cover_set_at is not null)
    returning ph.object_key
  )
  select coalesce(array_agg(d.object_key), '{}') into v_photo_keys from doomed d;

  return jsonb_build_object('keys', to_jsonb(v_run_keys || v_photo_keys));
end;
$$;

revoke execute on function public.admin_cleanup_test_runs(uuid) from public, anon, authenticated;
grant execute on function public.admin_cleanup_test_runs(uuid) to service_role;
