-- T75: the admin writes for template categories (ARCHITECTURE §5 「模板分类由后台管理」), one
-- function per action, service role only, each checking that p_actor is an admin like
-- admin_set_system_setting (0421). They raise these messages, which the admin code turns into
-- Chinese (core/admin/template-categories):
--   NOT_ADMIN               p_actor is not an admin
--   INVALID_INPUT           a missing or malformed field (detail says which)
--   CATEGORY_NOT_FOUND      no category with that key
--   CATEGORY_KEY_TAKEN      a new category's key is already used
--   CATEGORY_NAME_EN_TAKEN  another category has this English name (ignoring case)
--   CATEGORY_NAME_ZH_TAKEN  another category has this Chinese name
--   CATEGORY_SYSTEM         a built-in template's category (is_system): not editable or deletable
--   CATEGORY_LAST           deleting it would leave no category on the site
--   CATEGORY_MOVE_REQUIRED  templates use it and no destination was given

-- Create (p_is_new) or edit one category. The key is set once at creation and never changes;
-- an edit changes names, intros and card style only (a new English name is copied onto
-- templates.category by the 0581 trigger). A new category goes to the end of the site's order
-- and is never a system one. Empty intros are stored as null (no intro shown).
create function public.admin_save_template_category(p_category jsonb, p_is_new boolean, p_actor uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_key text := btrim(coalesce(p_category ->> 'key', ''));
  v_name_en text := btrim(coalesce(p_category ->> 'name_en', ''));
  v_name_zh text := btrim(coalesce(p_category ->> 'name_zh', ''));
  v_intro_en text := nullif(btrim(coalesce(p_category ->> 'intro_en', '')), '');
  v_intro_zh text := nullif(btrim(coalesce(p_category ->> 'intro_zh', '')), '');
  v_style text := coalesce(p_category ->> 'card_style', 'pair');
begin
  if p_actor is null or not exists (select 1 from public.profiles p where p.id = p_actor and p.role = 'admin') then
    raise exception 'NOT_ADMIN';
  end if;
  if v_name_en = '' or v_name_zh = '' then
    raise exception 'INVALID_INPUT' using detail = 'both names are required';
  end if;
  if exists (select 1 from public.template_categories c where lower(c.name_en) = lower(v_name_en) and c.key <> v_key) then
    raise exception 'CATEGORY_NAME_EN_TAKEN';
  end if;
  if exists (select 1 from public.template_categories c where c.name_zh = v_name_zh and c.key <> v_key) then
    raise exception 'CATEGORY_NAME_ZH_TAKEN';
  end if;

  if coalesce(p_is_new, false) then
    if exists (select 1 from public.template_categories c where c.key = v_key) then
      raise exception 'CATEGORY_KEY_TAKEN';
    end if;
    insert into public.template_categories (key, name_en, name_zh, intro_en, intro_zh, card_style, sort_order)
    values (
      v_key, v_name_en, v_name_zh, v_intro_en, v_intro_zh, v_style,
      (select coalesce(max(c.sort_order), 0) + 10 from public.template_categories c where not c.is_system)
    );
  else
    if exists (select 1 from public.template_categories c where c.key = v_key and c.is_system) then
      raise exception 'CATEGORY_SYSTEM';
    end if;
    update public.template_categories
    set name_en = v_name_en,
        name_zh = v_name_zh,
        intro_en = v_intro_en,
        intro_zh = v_intro_zh,
        card_style = v_style
    where key = v_key;
    if not found then
      raise exception 'CATEGORY_NOT_FOUND';
    end if;
  end if;
end;
$$;

revoke execute on function public.admin_save_template_category(jsonb, boolean, uuid) from public, anon, authenticated;
grant execute on function public.admin_save_template_category(jsonb, boolean, uuid) to service_role;

-- The whole order in one write: p_keys is every category except the system ones, each once, in
-- display order. System categories keep their place.
create function public.admin_reorder_template_categories(p_keys text[], p_actor uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_keys text[] := coalesce(p_keys, '{}');
begin
  if p_actor is null or not exists (select 1 from public.profiles p where p.id = p_actor and p.role = 'admin') then
    raise exception 'NOT_ADMIN';
  end if;
  if cardinality(v_keys) <> (select count(distinct k) from unnest(v_keys) as u(k))
     or (select array_agg(k order by k) from unnest(v_keys) as u(k))
        is distinct from (select array_agg(c.key order by c.key) from public.template_categories c where not c.is_system) then
    raise exception 'INVALID_INPUT' using detail = 'the order must list every category once';
  end if;

  update public.template_categories c
  set sort_order = o.position * 10
  from unnest(v_keys) with ordinality as o(key, position)
  where c.key = o.key and c.sort_order <> o.position * 10;
end;
$$;

revoke execute on function public.admin_reorder_template_categories(text[], uuid) from public, anon, authenticated;
grant execute on function public.admin_reorder_template_categories(text[], uuid) to service_role;

-- Delete one category. Templates using it (published or not) move to p_move_to, another
-- non-system category, in the same transaction (the 0581 trigger rewrites their
-- templates.category to its English name); with none, p_move_to is ignored. At least one
-- non-system category always remains. The categories are locked first so two deletes cannot
-- both pass that check. Returns how many templates moved.
create function public.admin_delete_template_category(p_key text, p_move_to text, p_actor uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_moved integer;
begin
  if p_actor is null or not exists (select 1 from public.profiles p where p.id = p_actor and p.role = 'admin') then
    raise exception 'NOT_ADMIN';
  end if;
  perform 1 from public.template_categories for update;
  if not exists (select 1 from public.template_categories c where c.key = p_key) then
    raise exception 'CATEGORY_NOT_FOUND';
  end if;
  if exists (select 1 from public.template_categories c where c.key = p_key and c.is_system) then
    raise exception 'CATEGORY_SYSTEM';
  end if;
  if (select count(*) from public.template_categories c where not c.is_system) <= 1 then
    raise exception 'CATEGORY_LAST';
  end if;

  if exists (select 1 from public.templates t where t.category_key = p_key) then
    if p_move_to is null then
      raise exception 'CATEGORY_MOVE_REQUIRED';
    end if;
    if p_move_to = p_key or not exists (select 1 from public.template_categories c where c.key = p_move_to and not c.is_system) then
      raise exception 'INVALID_INPUT' using detail = 'move_to must be another existing, non-system category';
    end if;
    update public.templates set category_key = p_move_to where category_key = p_key;
    get diagnostics v_moved = row_count;
  else
    v_moved := 0;
  end if;

  delete from public.template_categories where key = p_key;
  return v_moved;
end;
$$;

revoke execute on function public.admin_delete_template_category(text, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_template_category(text, text, uuid) to service_role;
