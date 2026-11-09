-- An optional data cutover can be rehearsed on the shared preview without resetting
-- its unrelated wallets. Both environments must refuse rollback after economic activity.
create table admin.pricing_release_checkpoint (version text primary key, fingerprint text not null);
alter table admin.pricing_release_checkpoint enable row level security;
revoke all on admin.pricing_release_checkpoint from public, anon, authenticated, service_role;

create function admin.pricing_activity_fingerprint() returns text language sql stable set search_path='' as $$
  select md5(jsonb_build_array(
    admin.wallet_digest_v2(),
    (select coalesce(max(id),0) from public.credit_ledger),
    (select jsonb_agg(to_jsonb(p) order by id) from public.payments p),
    (select jsonb_agg(to_jsonb(s) order by id) from public.subscriptions s),
    (select jsonb_agg(to_jsonb(d) order by stripe_dispute_id) from public.payment_disputes d),
    (select max(created_at) from public.generation_jobs)
  )::text)
$$;

create function admin.pricing_checkpoint_v2(p_rollback boolean) returns void language plpgsql set search_path='' as $$
declare current_digest text;
begin
  perform pg_advisory_xact_lock(hashtextextended('shotviva.template_catalog',0));
  lock table public.profiles,public.generation_jobs,public.credit_ledger,public.payments,public.subscriptions,public.payment_disputes in share row exclusive mode;
  current_digest := admin.pricing_activity_fingerprint();
  if p_rollback then
    delete from admin.pricing_release_checkpoint where version='v2' and fingerprint=current_digest;
    if not found then raise exception 'ECONOMIC_ACTIVITY_AFTER_CUTOVER'; end if;
  else
    insert into admin.pricing_release_checkpoint values('v2',current_digest) on conflict do nothing;
  end if;
end;
$$;
revoke all on function admin.pricing_checkpoint_v2(boolean),admin.pricing_activity_fingerprint() from public,anon,authenticated,service_role;
