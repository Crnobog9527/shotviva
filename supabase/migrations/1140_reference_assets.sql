-- Canonical, private reference images. Identity is the digest of the verified WebP.
create extension if not exists pg_trgm with schema extensions;

create function admin.reference_tags_valid(p_tags text[]) returns boolean
language sql immutable strict set search_path='' as $$
  select cardinality(p_tags)<=32
     and cardinality(p_tags)=(select count(distinct t) from unnest(p_tags) t)
     and not exists(select from unnest(p_tags) t where t<>btrim(t) or length(t) not between 1 and 64)
$$;

create table public.reference_assets (
  id uuid primary key,
  category_id text not null references public.template_categories(key),
  r2_key text not null unique check (r2_key='references/'||id::text||'.webp'),
  width integer not null check (width between 1 and 2048),
  height integer not null check (height between 1 and 2048),
  bytes integer not null check (bytes between 1 and 20971520),
  sha256 text not null unique check (sha256 ~ '^[a-f0-9]{64}$'),
  source_url text check (source_url ~* '^https?://[^[:space:]]+$' and length(source_url)<=2048),
  note text check (length(note)<=2000),
  tags text[] not null default '{}' check (admin.reference_tags_valid(tags)),
  status text not null default 'active' check (status in ('active','archived')),
  archived_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((status='archived') = (archived_at is not null))
);
create index reference_assets_paging on public.reference_assets(status,created_at desc,id desc);
create index reference_assets_category on public.reference_assets(category_id,status,created_at desc,id desc);
create index reference_assets_tags on public.reference_assets using gin(tags);
create index reference_assets_note on public.reference_assets using gin(note extensions.gin_trgm_ops);
create index reference_assets_creator on public.reference_assets(created_by) where created_by is not null;

create function admin.check_reference_category() returns trigger
language plpgsql set search_path='' as $$
begin
  if not exists(select from public.template_categories where key=new.category_id and kind='reference') then
    raise exception 'CATEGORY_NOT_FOUND';
  end if;
  return new;
end $$;
create trigger reference_asset_category before insert or update of category_id on public.reference_assets
for each row execute function admin.check_reference_category();

alter table public.reference_assets enable row level security;
revoke all on public.reference_assets from public,anon,authenticated;
grant select,insert,update,delete on public.reference_assets to service_role;

create function admin.require_reference_admin(p_actor uuid) returns void
language plpgsql stable set search_path='' as $$
begin
  if not exists(select from public.profiles where id=p_actor and role='admin' and banned_at is null) then
    raise exception 'NOT_ADMIN';
  end if;
end $$;
revoke all on function admin.require_reference_admin(uuid),admin.check_reference_category(),admin.reference_tags_valid(text[])
  from public,anon,authenticated;
grant execute on function admin.require_reference_admin(uuid),admin.check_reference_category(),admin.reference_tags_valid(text[])
  to service_role;
