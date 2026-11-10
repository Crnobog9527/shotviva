-- Permanent order FKs stay on public.products. A catalog revision is independent
-- of the global wallet cutover: v1 readers must always be able to see revision 1.
create table admin.catalog_products (
  product_id text primary key references public.products(id),
  tier text not null check (tier in ('starter','pro','max','pack')),
  kind text not null check (kind in ('monthly','yearly','pack')),
  published_revision integer,
  check ((tier = 'pack') = (kind = 'pack'))
);

create table admin.catalog_product_versions (
  product_id text not null references admin.catalog_products(product_id),
  revision integer not null check (revision > 0),
  usd_cents integer not null check (usd_cents > 0),
  credits integer not null check (credits > 0),
  paid_days integer check (paid_days > 0),
  listed boolean not null,
  sort_order integer not null,
  name_en text not null,
  name_zh text not null,
  primary key (product_id, revision)
);

alter table admin.catalog_products add foreign key (product_id, published_revision)
  references admin.catalog_product_versions(product_id, revision) deferrable initially deferred;

alter table admin.catalog_products enable row level security;
alter table admin.catalog_product_versions enable row level security;
revoke all on admin.catalog_products, admin.catalog_product_versions from public, anon, authenticated, service_role;

insert into admin.catalog_products(product_id,tier,kind,published_revision)
values ('starter_monthly','starter','monthly',2), ('starter_yearly','starter','yearly',2),
       ('pro_monthly','pro','monthly',2), ('pro_yearly','pro','yearly',2),
       ('max_monthly','max','monthly',2), ('max_yearly','max','yearly',2),
       ('pack_s','pack','pack',2), ('pack_m','pack','pack',2), ('pack_l','pack','pack',2);

insert into admin.catalog_product_versions
  (product_id, revision, usd_cents, credits, paid_days, listed, sort_order, name_en, name_zh)
select p.id, terms.revision, terms.cents, terms.credits, p.days, p.active, label.sort_order, label.en, label.zh
from public.products p
join admin.product_terms_v2 v on v.product_id = p.id
join (values
  ('starter_monthly',1,'Starter monthly','入门版月付'), ('starter_yearly',2,'Starter yearly','入门版年付'),
  ('pro_monthly',3,'Pro monthly','专业版月付'), ('pro_yearly',4,'Pro yearly','专业版年付'),
  ('max_monthly',5,'Max monthly','旗舰版月付'), ('max_yearly',6,'Max yearly','旗舰版年付'),
  ('pack_s',7,'Small pack','小积分包'), ('pack_m',8,'Medium pack','中积分包'), ('pack_l',9,'Large pack','大积分包')
) label(id,sort_order,en,zh) on label.id = p.id
cross join lateral (values (1,(p.price_usd * 100)::integer,p.credits),(2,v.usd_cents,v.credits))
  terms(revision,cents,credits);
