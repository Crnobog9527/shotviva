-- T75: templates.category_key, the template's category as a template_categories key (ARCHITECTURE
-- §5). Expand only: templates.category keeps holding the category's English name exactly as
-- before, so code that reads or writes the name (the build live before T75, the prompt import)
-- keeps working on this database. A later card drops templates.category once nothing reads it.
--
-- One trigger keeps the two columns in step on every write:
--   * a write that sets category_key (new code, a delete's move): category becomes that
--     category's English name;
--   * a write that sets only category (old code, the import, a migration): category_key is
--     found from it by key, English name (any case, outer spaces) or Chinese name; a value no
--     category has gets a category of its own, as 「新分类…」 used to; category becomes that
--     category's English name.
-- Renaming a category's English name rewrites templates.category (second trigger).

-- The category a stored value names, created when none matches: key = the value as a slug,
-- names = the value cut to the limits, numbered until unique. Null for an empty value.
create function public.template_category_for(p_value text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_value text := btrim(coalesce(p_value, ''));
  v_key text;
  v_base text;
  v_name_en text;
  v_name_zh text;
  v_n integer;
begin
  if v_value = '' then
    return null;
  end if;
  select c.key into v_key
  from public.template_categories c
  where c.key = v_value or lower(c.name_en) = lower(v_value) or c.name_zh = v_value
  order by (c.key = v_value) desc, c.sort_order
  limit 1;
  if v_key is not null then
    return v_key;
  end if;

  v_base := rtrim(left(btrim(regexp_replace(lower(v_value), '[^a-z0-9]+', '-', 'g'), '-'), 36), '-');
  if v_base = '' then
    v_base := 'category';
  end if;
  v_key := v_base;
  v_n := 1;
  while exists (select 1 from public.template_categories c where c.key = v_key) loop
    v_n := v_n + 1;
    v_key := v_base || '-' || v_n;
  end loop;

  v_name_en := btrim(left(v_value, 32));
  v_n := 1;
  while exists (select 1 from public.template_categories c where lower(c.name_en) = lower(v_name_en)) loop
    v_n := v_n + 1;
    v_name_en := btrim(left(v_value, 32 - length(' ' || v_n))) || ' ' || v_n;
  end loop;
  v_name_zh := btrim(left(v_value, 12));
  v_n := 1;
  while exists (select 1 from public.template_categories c where c.name_zh = v_name_zh) loop
    v_n := v_n + 1;
    v_name_zh := btrim(left(v_value, 12 - length(' ' || v_n))) || ' ' || v_n;
  end loop;

  insert into public.template_categories (key, name_en, name_zh, card_style, sort_order)
  values (
    v_key, v_name_en, v_name_zh, 'pair',
    (select coalesce(max(c.sort_order), 0) + 10 from public.template_categories c where not c.is_system)
  );
  return v_key;
end;
$$;

revoke execute on function public.template_category_for(text) from public, anon, authenticated;
grant execute on function public.template_category_for(text) to service_role;

alter table public.templates add column category_key text;

-- One value at a time, so a value that creates a category is created once.
do $$
declare
  v_value text;
begin
  for v_value in select distinct t.category from public.templates t order by 1 loop
    update public.templates set category_key = public.template_category_for(v_value) where category = v_value;
  end loop;
end;
$$;

alter table public.templates alter column category_key set not null;

-- Keys never change (the admin functions have no rename), so no ON UPDATE action; a category
-- in use is only deleted by admin_delete_template_category, which moves its templates first.
alter table public.templates
  add constraint templates_category_key_fkey foreign key (category_key) references public.template_categories (key);

-- Serves the foreign key on delete and the admin's move / count by category (0582).
create index templates_category_key_idx on public.templates (category_key);

create function public.templates_sync_category()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.category_key is not null and (tg_op = 'INSERT' or new.category_key is distinct from old.category_key) then
    -- The key was written: the name follows it below.
    null;
  elsif tg_op = 'INSERT' or new.category is distinct from old.category then
    -- Only the name was written. A rename of the template's own category keeps its key.
    if tg_op = 'INSERT' or not exists (
      select 1 from public.template_categories c
      where c.key = new.category_key
        and (c.key = btrim(new.category) or lower(c.name_en) = lower(btrim(new.category)) or c.name_zh = btrim(new.category))
    ) then
      new.category_key := public.template_category_for(new.category);
    end if;
  end if;
  -- An unknown key keeps a non-null name, so the foreign key (not NOT NULL) is what refuses it.
  new.category := coalesce((select c.name_en from public.template_categories c where c.key = new.category_key), new.category, new.category_key);
  return new;
end;
$$;

create trigger templates_sync_category
  before insert or update of category, category_key on public.templates
  for each row execute function public.templates_sync_category();

create function public.template_categories_sync_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.templates set category = new.name_en where category_key = new.key and category <> new.name_en;
  return null;
end;
$$;

create trigger template_categories_sync_name
  after update of name_en on public.template_categories
  for each row when (old.name_en is distinct from new.name_en)
  execute function public.template_categories_sync_name();
