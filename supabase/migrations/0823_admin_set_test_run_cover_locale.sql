-- T87: 「设为封面」 of an admin test run into a language's cover (ARCHITECTURE §8.3). Replaces the
-- body of 0787 under the same signature (its p_locale was added for this):
--   p_locale null   the common cover columns, as before;
--   p_locale 'zh'…  cover_locales -> 'zh' -> "after"; "before" only when given and the template has
--                   no common "before" (the photo side is shared across languages, §8.3); the
--                   language's other keys stay.
-- A translation run (kind 'translate', T87) can only become the "after" of the language it was
-- translated into (inputs.target_locale), never the common cover or another language, and never
-- sets a "before"; anything else raises TRANSLATE_TARGET_ONLY.
-- A language code is any short lowercase tag (en, zh, ja, pt-br…): launched and upcoming languages
-- both take covers; the site only ever shows launched ones.

create or replace function public.admin_set_test_run_cover(p_actor uuid, p_run_id uuid, p_before_url text, p_after_url text, p_locale text default null)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_template text;
  v_run public.admin_test_runs;
begin
  if p_actor is null or not exists (select 1 from public.profiles p where p.id = p_actor and p.role = 'admin') then
    raise exception 'NOT_ADMIN';
  end if;
  if p_locale is not null and p_locale !~ '^[a-z]{2,3}(-[a-z0-9]{2,8})?$' then
    raise exception 'INVALID_INPUT' using detail = 'unknown language code';
  end if;
  if p_after_url is null or p_after_url !~ '^https://' or (p_before_url is not null and p_before_url !~ '^https://') then
    raise exception 'INVALID_INPUT' using detail = 'cover URLs must be https';
  end if;

  select * into v_run from public.admin_test_runs r
   where r.id = p_run_id and r.status = 'succeeded' and r.output_key is not null
   for update;
  if not found then
    raise exception 'TEST_RUN_NOT_FOUND';
  end if;
  if v_run.kind = 'translate'
     and (p_locale is distinct from (v_run.inputs ->> 'target_locale') or p_before_url is not null) then
    raise exception 'TRANSLATE_TARGET_ONLY';
  end if;

  update public.admin_test_runs r set cover_set_at = now() where r.id = p_run_id;
  v_template := v_run.template_id;

  if p_locale is null then
    update public.templates t
       set cover_after_url = p_after_url,
           cover_before_url = coalesce(p_before_url, t.cover_before_url)
     where t.id = v_template;
  else
    update public.templates t
       set cover_locales = jsonb_set(
             t.cover_locales,
             array[p_locale],
             coalesce(t.cover_locales -> p_locale, '{}'::jsonb)
               || jsonb_build_object('after', p_after_url)
               || case when p_before_url is null or t.cover_before_url is not null then '{}'::jsonb
                       else jsonb_build_object('before', p_before_url) end)
     where t.id = v_template;
  end if;
  return v_template;
end;
$$;
