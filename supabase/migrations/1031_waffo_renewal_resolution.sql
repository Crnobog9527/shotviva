-- The original evidence stays immutable after a reviewer clears its pending ticket.
alter table admin.waffo_renewal_periods
  add column resolved_ticket_id uuid unique,
  add column resolution text check (resolution in ('settled','refunded')),
  add constraint waffo_resolution_ticket check (
    (resolution is null) = (resolved_ticket_id is null));
create index waffo_renewal_period_lookup on admin.waffo_renewal_periods(order_id,period_number);

alter table public.admin_audit_log drop constraint admin_audit_log_action_check,
  add constraint admin_audit_log_action_check check (action in (
  'ban_user','unban_user','view_work','replay_checkout','decide_refund','submit_dispute','clawback_payment',
  'save_code','set_code_active','affiliate_create','affiliate_decide','affiliate_set','affiliate_rebind',
  'affiliate_adjust','affiliate_commission_release','affiliate_payout_decide','affiliate_settings','affiliate_recompute',
  'waffo_renewal_settled','waffo_renewal_refunded'));

create function public.admin_waffo_renewal_review(p_ticket uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('payment',r.payment_id,'order',r.order_id,'period',r.period_number,
    'quoted',r.quoted_cents,'charged',r.charged_cents,'tax',r.tax_cents,'currency',r.currency,
    'reason',r.review_reason,'resolution',r.resolution,'period_paid',exists(
      select from admin.waffo_renewal_periods other join public.payments p on p.waffo_payment_id=other.payment_id
      where other.order_id=r.order_id and other.period_number=r.period_number))
  from admin.waffo_renewal_periods r where r.ticket_id=p_ticket or r.resolved_ticket_id=p_ticket;
$$;

create function public.admin_resolve_waffo_renewal(
  p_actor uuid,p_ticket uuid,p_decision text,p_total_usd_cents integer,p_tax_usd_cents integer
) returns void language plpgsql security definer set search_path = '' as $$
declare
  r admin.waffo_renewal_periods;
  v_change public.credit_change;
  v_payment bigint;
  v_body text;
begin
  if not exists(select from public.profiles where id=p_actor and role='admin' and banned_at is null) then
    raise exception 'FORBIDDEN';
  end if;
  if p_decision is null or p_decision not in ('settled','refunded') then raise exception 'INVALID_INPUT'; end if;
  if p_decision='refunded' and (p_total_usd_cents is not null or p_tax_usd_cents is not null) then
    raise exception 'INVALID_INPUT';
  end if;
  select * into r from admin.waffo_renewal_periods where ticket_id=p_ticket or resolved_ticket_id=p_ticket;
  if not found then raise exception 'TICKET_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended('waffo-renewal:' || r.order_id || ':' || r.period_number,0));
  select * into strict r from admin.waffo_renewal_periods where payment_id=r.payment_id for update;
  if r.resolution=p_decision then return; end if;
  if r.resolution is not null then raise exception 'CONFLICT'; end if;
  perform 1 from public.support_tickets where id=p_ticket and user_id=r.user_id and type='billing' for update;
  if not found then raise exception 'TICKET_NOT_FOUND'; end if;
  if p_decision='settled' then
    if p_total_usd_cents is null or p_tax_usd_cents is null or p_tax_usd_cents<0 or p_total_usd_cents<=p_tax_usd_cents then
      raise exception 'INVALID_INPUT';
    end if;
    -- Any payment already fulfilling this period prevents a second extension, even under another PAY.
    if exists(select from admin.waffo_renewal_periods other join public.payments p on p.waffo_payment_id=other.payment_id
      where other.order_id=r.order_id and other.period_number=r.period_number) then raise exception 'CONFLICT'; end if;
    v_change := public.settle_waffo_order_v2(r.user_id,r.product_id,r.payment_id,r.order_id,p_total_usd_cents,'usd',p_tax_usd_cents,'card');
    if not v_change.applied then raise exception 'CONFLICT'; end if;
    select id into strict v_payment from public.payments where waffo_payment_id=r.payment_id;
    v_body := E'已核对本期续费。积分已到账，会员有效期已更新。\nWe’ve verified your renewal, added your credits and updated your membership expiry.';
  else
    if exists(select from public.payments where waffo_payment_id=r.payment_id) then raise exception 'CONFLICT'; end if;
    v_body := E'已确认这笔续费扣款已退款。\nWe’ve confirmed that this renewal charge was refunded.';
  end if;
  update admin.waffo_renewal_periods set ticket_id=null,resolved_ticket_id=p_ticket,resolution=p_decision where payment_id=r.payment_id;
  update public.support_tickets set status='closed',closed_at=now(),last_message_at=now(),payment_id=v_payment where id=p_ticket;
  insert into public.support_ticket_messages(ticket_id,author,body) values(p_ticket,'admin',v_body);
  insert into public.admin_audit_log(action,user_id,target_id,reason) values('waffo_renewal_' || p_decision,r.user_id,p_ticket::text,
    jsonb_build_object('actor',p_actor,'order',r.order_id,'period',r.period_number,'payment',r.payment_id,
      'total_usd_cents',p_total_usd_cents,'tax_usd_cents',p_tax_usd_cents)::text);
end;
$$;
revoke all on function public.admin_waffo_renewal_review(uuid),public.admin_resolve_waffo_renewal(uuid,uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.admin_waffo_renewal_review(uuid),public.admin_resolve_waffo_renewal(uuid,uuid,text,integer,integer) to service_role;
