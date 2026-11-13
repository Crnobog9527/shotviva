-- [contract] One-time cleanup (Owner 2026-11-13, 「下架的系列成员自动移出系列」): 1400 only acts on a
-- template going 上架 → 下架 from now on; this removes the members that were already unpublished
-- (or soft-deleted, 1401) before it, on whichever database it runs (test site and production).
-- What it changes, and nothing else: those templates get series_id null and series_sort_order 0;
-- the members left in each affected series are renumbered 1, 2, 3… in their current order. No
-- row is deleted, no column or function the deployed code uses changes, and the deployed code
-- already treats a template without a series as a standalone one. A series left with no visible
-- member stays hidden on the site, as web_catalogue_entries already requires one.
-- Each removal is reported as a NOTICE (template id, series slug, 'auto: unpublished') in the
-- DB push log: admin_audit_log needs a real admin as user_id and a migration has none.
-- Idempotent: once run, nothing matches, so a second run changes and reports nothing.
-- Written as a function so the DB test runs exactly this code; it stays callable by no client
-- role (revoked), only by the migration and the tests as postgres.

create function admin.remove_unpublished_series_members() returns integer
language plpgsql set search_path = '' as $$
declare
  r record;
  v_series uuid[] := '{}';
  v_removed integer := 0;
begin
  -- Same lock order as the series save and the T93 sync: category tree shared, series, rows.
  perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.category_tree', 0));
  perform pg_advisory_xact_lock(hashtextextended('shotviva.template_series', 0));
  for r in
    select t.id, t.series_id, s.slug from public.templates t join public.template_series s on s.id = t.series_id
    where not t.is_active or t.deleted_at is not null
    order by s.slug, t.series_sort_order, t.id
    for update of t
  loop
    raise notice 'auto: unpublished: template % left series %', r.id, r.slug;
    update public.templates set series_id = null, series_sort_order = 0 where id = r.id;
    if not r.series_id = any(v_series) then v_series := v_series || r.series_id; end if;
    v_removed := v_removed + 1;
  end loop;
  -- Only the series a member just left: their remaining members become 1, 2, 3… in current order.
  update public.templates t set series_sort_order = n.ord
    from (select id, row_number() over (partition by series_id order by series_sort_order, id)::integer as ord
          from public.templates where series_id = any(v_series)) n
    where t.id = n.id and t.series_sort_order <> n.ord;
  return v_removed;
end $$;
revoke all on function admin.remove_unpublished_series_members() from public, anon, authenticated, service_role;

select admin.remove_unpublished_series_members();
