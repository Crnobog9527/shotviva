-- PostgREST's legacy templates(category) computed relationship intentionally resolves to
-- root assignments. This admin-only computed column counts direct assignments at any depth.
create function public.admin_assigned_template_count(public.template_categories)
returns bigint language sql stable set search_path = '' as $$
  select case when $1.parent_id is null then
    (select count(*) from public.templates t where t.category_key=$1.key and t.subcategory_key is null)
  else
    (select count(*) from public.templates t where t.subcategory_key=$1.key)
  end
$$;
revoke all on function public.admin_assigned_template_count(public.template_categories) from public,anon,authenticated;
grant execute on function public.admin_assigned_template_count(public.template_categories) to service_role;
