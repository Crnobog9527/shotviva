-- T85: 「设为封面」 for an admin test run (ARCHITECTURE §10.b). The app has already converted the
-- run's result (after) and its test photo (before) by the cover rules (§8.3) and written them to
-- the public bucket; this points the template at both public URLs and stamps the run, in one
-- transaction, so a run marked as the cover always matches what the template shows. Motion
-- covers are untouched. Only a succeeded run of the template with a result can be the cover.
-- Returns the template id (for the caller's cache tag).
--
-- p_locale: which language's cover (ARCHITECTURE §13 「封面按语言适配」, T87). null = the common
-- cover (the existing columns, admin tab 「通用」, shown for every language that has no cover of its
-- own), the only target until T87 adds templates.cover_locales. The parameter is in the signature
-- now so T87 changes the body with create or replace, not the signature; until then a language is
-- refused.

create function public.admin_set_test_run_cover(p_actor uuid, p_run_id uuid, p_before_url text, p_after_url text, p_locale text default null)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_template text;
begin
  if p_actor is null or not exists (select 1 from public.profiles p where p.id = p_actor and p.role = 'admin') then
    raise exception 'NOT_ADMIN';
  end if;
  if p_locale is not null then
    raise exception 'INVALID_INPUT' using detail = 'per-language covers arrive with T87';
  end if;
  if p_after_url is null or p_after_url !~ '^https://' or (p_before_url is not null and p_before_url !~ '^https://') then
    raise exception 'INVALID_INPUT' using detail = 'cover URLs must be https';
  end if;

  update public.admin_test_runs r
     set cover_set_at = now()
   where r.id = p_run_id and r.status = 'succeeded' and r.output_key is not null
  returning r.template_id into v_template;
  if v_template is null then
    raise exception 'TEST_RUN_NOT_FOUND';
  end if;

  update public.templates t
     set cover_after_url = p_after_url,
         cover_before_url = coalesce(p_before_url, t.cover_before_url)
   where t.id = v_template;
  return v_template;
end;
$$;

revoke execute on function public.admin_set_test_run_cover(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_set_test_run_cover(uuid, uuid, text, text, text) to service_role;
