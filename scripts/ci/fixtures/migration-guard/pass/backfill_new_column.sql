-- expect: none
-- expect-warning: set-not-null-new-column
-- A column this file adds, backfilled (also inside a do block) and then made not null without a
-- default: passes, with a warning that the deployed code's inserts need a trigger to fill it
-- (T75 0581 has templates_sync_category).
alter table public.templates add column category_key text;
update public.templates set category_key = lower(category);
do $$
declare
  v_value text;
begin
  for v_value in select distinct t.category from public.templates t loop
    update public.templates set category_key = lower(v_value) where category = v_value;
  end loop;
end;
$$;
alter table public.templates alter column category_key set not null;
