-- Keep the issue amount immutable. Rows paid before T100 keep their original face value.
alter table public.affiliate_payouts add column paid_amount bigint check (paid_amount between 0 and amount);
alter table public.affiliate_payouts drop constraint affiliate_payouts_status_check,
  add constraint affiliate_payouts_status_check check (status in ('due','held','paid','void'));

create or replace view public.affiliate_balances with (security_invoker = true) as
select a.user_id affiliate_user_id,coalesce(c.confirmed,0)::bigint confirmed,
       coalesce(c.pending,0)::bigint pending,coalesce(p.paid,0)::bigint paid,
       (coalesce(c.confirmed,0)+coalesce(j.adjusted,0)-coalesce(p.reserved,0))::bigint available
  from public.affiliates a
  left join lateral (select sum(amount) filter (where status='confirmed') confirmed,
                            sum(amount) filter (where status='pending') pending
                       from public.affiliate_commissions where affiliate_user_id=a.user_id) c on true
  left join lateral (select sum(amount) adjusted from public.affiliate_adjustments where affiliate_user_id=a.user_id) j on true
  left join lateral (select sum(coalesce(paid_amount,amount)) filter (where status='paid') paid,
                            sum(case when status='paid' then coalesce(paid_amount,amount) else amount end) filter (where status in ('paid','due','held')) reserved
                       from public.affiliate_payouts where affiliate_user_id=a.user_id) p on true;
