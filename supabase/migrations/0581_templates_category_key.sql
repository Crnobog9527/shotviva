-- T75: templates.category stores a template_categories key from now on (ARCHITECTURE §5).
-- Until now it held the admin's typed text: one of the six English names, or anything typed
-- under 「新分类…」, the built-in photo-edit template's 'edit' (0264) and the partner 'freeform' (0003).
--
-- 1. Every stored value is matched to a category by its key, its English name (ignoring case
--    and outer spaces, as the home page matched it) or its Chinese name.
-- 2. A value that matches none gets its own category: key = the value as a slug, names = the
--    value as typed (cut to the length limits), so nothing disappears from the site and the
--    Owner can rename or delete it in admin. The two built-in templates' values get Chinese
--    names: 'edit' (photo edit, on no surface) 修图 / Photo edit, 'freeform' (partner only)
--    自由生成 / freeform.
-- 3. Every template is rewritten to its key, then the foreign key holds it there.

do $$
declare
  v_value record;
  v_base text;
  v_key text;
  v_name_en text;
  v_name_zh text;
  v_n integer;
begin
  create temporary table category_map (low text primary key, key text not null);

  insert into category_map (low, key)
  select distinct on (lower(btrim(t.category))) lower(btrim(t.category)), c.key
  from public.templates t
  join public.template_categories c
    on c.key = btrim(t.category) or lower(c.name_en) = lower(btrim(t.category)) or c.name_zh = btrim(t.category)
  order by lower(btrim(t.category)), c.sort_order;

  for v_value in
    select lower(btrim(t.category)) as low, min(btrim(t.category)) as raw
    from public.templates t
    where not exists (select 1 from category_map m where m.low = lower(btrim(t.category)))
    group by lower(btrim(t.category))
    order by 1
  loop
    v_base := rtrim(left(btrim(regexp_replace(v_value.low, '[^a-z0-9]+', '-', 'g'), '-'), 36), '-');
    if v_base = '' then
      v_base := 'category';
    end if;
    v_key := v_base;
    v_n := 1;
    while exists (select 1 from public.template_categories where key = v_key) loop
      v_n := v_n + 1;
      v_key := v_base || '-' || v_n;
    end loop;

    if v_value.low = 'edit' then
      v_name_en := 'Photo edit';
      v_name_zh := '修图';
    elsif v_value.low = 'freeform' then
      -- The partner API shows the English name as `category`; it stays 'freeform'.
      v_name_en := 'freeform';
      v_name_zh := '自由生成';
    else
      v_name_en := coalesce(nullif(btrim(left(v_value.raw, 32)), ''), left(v_key, 32));
      v_name_zh := coalesce(nullif(btrim(left(v_value.raw, 12)), ''), left(v_key, 12));
    end if;
    -- A cut-down name can collide with another category's: the key, unique by construction,
    -- stands in for it until the Owner renames the category.
    if exists (select 1 from public.template_categories where lower(name_en) = lower(v_name_en)) then
      v_name_en := left(v_key, 32);
    end if;
    if exists (select 1 from public.template_categories where name_zh = v_name_zh) then
      v_name_zh := left(v_key, 12);
    end if;

    insert into public.template_categories (key, name_en, name_zh, card_style, sort_order)
    values (
      v_key, v_name_en, v_name_zh, 'pair',
      (select coalesce(max(sort_order), 0) + 10 from public.template_categories)
    );
    insert into category_map (low, key) values (v_value.low, v_key);
  end loop;

  update public.templates t
  set category = m.key
  from category_map m
  where m.low = lower(btrim(t.category))
    and t.category <> m.key;

  drop table category_map;
end;
$$;

-- Keys never change (the admin functions have no rename), so no ON UPDATE action; a category
-- in use is only deleted by admin_delete_template_category, which moves its templates first.
alter table public.templates
  add constraint templates_category_fkey foreign key (category) references public.template_categories (key);

-- Serves the foreign key on delete and the move / count by category in admin (0582).
create index templates_category_idx on public.templates (category);
