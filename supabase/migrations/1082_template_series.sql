create table public.template_series (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_en text not null check (btrim(name_en)<>''),
  name_zh text not null check (btrim(name_zh)<>''),
  description_en text, description_zh text, cover_url text,
  category_key text not null references public.template_categories(key),
  sort_order integer not null default 0,
  is_active boolean not null default false,
  show_members boolean not null default false
);
create index template_series_category_idx on public.template_series(category_key,sort_order,id);
create function admin.check_series_category() returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists(select 1 from public.template_categories where key=new.category_key and kind='template' and not is_system)
    then raise exception 'INVALID_SERIES_CATEGORY'; end if;
  return new;
end $$;
create trigger series_category before insert or update of category_key on public.template_series
for each row execute function admin.check_series_category();

alter table public.templates add column series_id uuid references public.template_series(id) on delete set null,
  add column series_sort_order integer not null default 0;
create index templates_series_member_idx on public.templates(series_id,series_sort_order,id) where series_id is not null;
alter table public.template_series enable row level security;
create policy series_read on public.template_series for select to anon,authenticated using
  (is_active and exists(select 1 from public.template_category_paths c where c.key=category_key and c.web_visible)
   and exists(select 1 from public.templates t join public.template_category_paths c
     on c.key=coalesce(t.subcategory_key,t.category_key)
     where t.series_id=template_series.id and t.is_active and 'web'=any(t.visible_in) and c.web_visible));
revoke all on public.template_series from anon,authenticated;
grant select on public.template_series to anon,authenticated;
grant all on public.template_series to service_role;
