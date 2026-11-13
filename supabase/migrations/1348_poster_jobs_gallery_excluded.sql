-- Dense-text posters (ARCHITECTURE §5.3): a work made from a poster template (templates.fields
-- has 'poster') is gallery-excluded, and so private, whichever category the template is filed
-- under. 1320 excludes the posters root; this also covers a poster template filed elsewhere by
-- mistake, since those works carry the user's phone numbers and address. Same trigger body as
-- 1320 with one more condition; grants are unchanged.
create or replace function admin.keep_gallery_excluded_private() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.gallery_excluded := new.gallery_excluded
      or exists (
        select 1 from public.templates t
          join public.template_category_paths p on p.key = coalesce(t.subcategory_key, t.category_key)
          join public.template_categories r on r.key = p.root_key
         where t.id = new.template_id and r.gallery_excluded)
      or exists (
        select 1 from public.generation_jobs parent
         where parent.id = new.parent_job_id and parent.gallery_excluded)
      -- A dense-text poster template (fields.poster), wherever it is filed (1348).
      or exists (select 1 from public.templates t where t.id = new.template_id and t.fields ? 'poster');
  elsif old.gallery_excluded and not new.gallery_excluded then
    raise exception 'GALLERY_EXCLUDED_IMMUTABLE';
  end if;
  if new.gallery_excluded then
    new.visibility := 'private';
  end if;
  return new;
end $$;
