-- Installing the approved catalogue is inert. Only the parent pricing cutover activates it.
create view admin.template_tariffs_v2 (id, quality, costs) as
select id, 'medium'::text, case
  when id = 'edit' then '{"1k":20,"2k":37,"3k":58}'::jsonb
  when id in ('promo-poster','pet-studio','freeform') then '{"1k":45,"2k":120,"3k":190}'::jsonb
  else '{"1k":74,"2k":150,"3k":225}'::jsonb end
from unnest(array['dark-dining','delivery-menu','white-background','lifestyle-table','spa-podium',
  'promo-poster','pet-studio','freeform','edit']) id;
revoke all on admin.template_tariffs_v2 from public,anon,authenticated,service_role;

create table admin.template_price_batches (
  id bigint generated always as identity primary key,
  applied_at timestamptz not null default clock_timestamp(),
  reverted_at timestamptz
);
create unique index template_price_one_batch on admin.template_price_batches ((true)) where reverted_at is null;
create table admin.template_price_snapshots (
  batch_id bigint not null references admin.template_price_batches(id),
  template_id text not null,
  previous jsonb not null,
  applied jsonb not null,
  provider_id uuid,
  provider_endpoint_hash text,
  primary key (batch_id, template_id)
);
alter table admin.template_price_batches enable row level security;
alter table admin.template_price_snapshots enable row level security;
revoke all on admin.template_price_batches,admin.template_price_snapshots from public,anon,authenticated,service_role;

create function admin.template_price_state(t public.templates) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('quality',t.quality,'costs',t.credits_cost,'active',t.is_active,'featured',t.featured_rank)
$$;
revoke all on function admin.template_price_state(public.templates) from public,anon,authenticated,service_role;

create function admin.is_template_catalog_v2() returns boolean language sql stable security definer set search_path='' as $$
 select exists (select 1 from public.system_settings where key='pricing_catalog_version' and value='"v2"'::jsonb)
$$;
revoke all on function admin.is_template_catalog_v2() from public,anon,authenticated;
grant execute on function admin.is_template_catalog_v2() to service_role;
