alter table admin.catalog_product_versions
  add column benefit_en text not null default '',
  add column benefit_zh text not null default '';

-- An immutable draft points at the terms the operator originally compared. A later
-- save creates another revision; the previously reviewed revision cannot change.
create table admin.catalog_publications (
  id uuid primary key default gen_random_uuid(),
  product_id text not null,
  revision integer not null,
  base_revision integer,
  -- Who saved the draft. A deleted admin account keeps the history (SET NULL), like codes.created_by.
  actor_id uuid references public.profiles(id) on delete set null,
  reason text not null check(length(trim(reason)) between 1 and 500),
  status text not null default 'draft' check (status in ('draft','superseded','prepared','published')),
  stripe_account text,
  livemode boolean,
  created_at timestamptz not null default now(),
  prepared_at timestamptz,
  published_at timestamptz,
  retry_at timestamptz,
  last_error text,
  unique(product_id,revision),
  foreign key(product_id, revision) references admin.catalog_product_versions(product_id,revision)
);
create unique index catalog_one_pending on admin.catalog_publications(product_id) where status in ('prepared','draft');
create index catalog_publication_history on admin.catalog_publications(product_id,created_at desc,id desc);
create index catalog_publication_retry on admin.catalog_publications(retry_at) where status='prepared' and retry_at is not null;
create index catalog_publication_actor on admin.catalog_publications(actor_id);

-- A preview database and production database must never share a Stripe identity.
create table admin.catalog_stripe_environment (
  singleton boolean primary key default true check(singleton),
  stripe_account text not null check(stripe_account ~ '^acct_[A-Za-z0-9]+$'),
  livemode boolean not null,
  unique(stripe_account,livemode)
);
create table admin.catalog_stripe_prices (
  product_id text not null, revision integer not null, lookup_key text not null,
  price_id text not null check(price_id ~ '^price_[A-Za-z0-9]+$'),
  stripe_account text not null, livemode boolean not null, stripe_product text not null,
  usd_cents integer not null check(usd_cents > 0), archived_at timestamptz,
  primary key(product_id,revision,lookup_key),
  foreign key(product_id,revision) references admin.catalog_product_versions(product_id,revision),
  foreign key(stripe_account,livemode) references admin.catalog_stripe_environment(stripe_account,livemode)
);
create index catalog_stripe_price_id on admin.catalog_stripe_prices(price_id);
create index catalog_stripe_env on admin.catalog_stripe_prices(stripe_account,livemode);
create table admin.catalog_waffo_bindings (
  product_id text not null, revision integer not null, store_id text not null, mode text not null check(mode in ('prod','test')),
  one_time_id text not null, recurring_id text, usd_cents integer not null,
  primary key(product_id,revision), foreign key(product_id,revision) references admin.catalog_product_versions(product_id,revision)
);
create index catalog_waffo_recurring on admin.catalog_waffo_bindings(store_id,mode,recurring_id) where recurring_id is not null;

alter table admin.catalog_publications enable row level security;
alter table admin.catalog_stripe_environment enable row level security;
alter table admin.catalog_stripe_prices enable row level security;
alter table admin.catalog_waffo_bindings enable row level security;
revoke all on admin.catalog_publications,admin.catalog_stripe_environment,admin.catalog_stripe_prices,admin.catalog_waffo_bindings from public,anon,authenticated,service_role;

alter table public.admin_audit_log drop constraint admin_audit_log_action_check,
  add constraint admin_audit_log_action_check check (action in (
  'ban_user','unban_user','view_work','replay_checkout','decide_refund','submit_dispute','clawback_payment',
  'save_code','set_code_active','affiliate_create','affiliate_decide','affiliate_set','affiliate_rebind',
  'affiliate_adjust','affiliate_commission_release','affiliate_payout_decide','affiliate_settings','affiliate_recompute',
  'waffo_renewal_settled','waffo_renewal_refunded','catalog_save','catalog_prepare','catalog_publish','catalog_retry','catalog_archive','catalog_waffo'));

create function admin.catalog_require_actor(p_actor uuid) returns void language plpgsql set search_path='' as $$
begin
  if not exists(select from public.profiles where id=p_actor and role='admin' and banned_at is null) then raise exception 'NOT_ADMIN'; end if;
end $$;

create function admin.catalog_audit(p_actor uuid,p_action text,p_request admin.catalog_publications,p_details jsonb default '{}')
returns void language sql set search_path='' as $$
  insert into public.admin_audit_log(action,user_id,target_id,reason) values
    (p_action,p_actor,p_request.product_id,jsonb_build_object('request',p_request.id,'from',p_request.base_revision,
     'to',p_request.revision,'reason',p_request.reason,'details',p_details,
     'before',(select to_jsonb(v) from admin.catalog_product_versions v where (v.product_id,v.revision)=(p_request.product_id,p_request.base_revision)),
     'after',(select to_jsonb(v) from admin.catalog_product_versions v where (v.product_id,v.revision)=(p_request.product_id,p_request.revision)))::text)
$$;
revoke all on function admin.catalog_require_actor(uuid),admin.catalog_audit(uuid,text,admin.catalog_publications,jsonb) from public,anon,authenticated,service_role;

-- Once this installation can prepare a publication, checkout must fail closed if
-- its binding RPC disappears. The phase-one binary ignores this compatibility marker.
insert into public.system_settings(key,value) values ('catalog_binding_required','true'::jsonb)
  on conflict(key) do update set value=excluded.value;
