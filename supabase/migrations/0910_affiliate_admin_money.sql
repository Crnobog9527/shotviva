create function public.admin_affiliate_adjust(p_actor uuid,p_input jsonb) returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(p_input->>'user_id')::uuid; v_request uuid:=(p_input->>'request_id')::uuid;
  v_amount bigint:=(p_input->>'amount')::bigint; v_reason text:=nullif(trim(p_input->>'reason'),''); v_id bigint;
begin
  perform public._affiliate_require_admin(p_actor);
  insert into public.affiliate_adjustments(request_id,affiliate_user_id,amount,reason,created_by)
    values(v_request,v_user,v_amount,v_reason,p_actor) on conflict(request_id) do nothing returning id into v_id;
  if v_id is null then
    if not exists(select from public.affiliate_adjustments where request_id=v_request and affiliate_user_id=v_user
      and amount=v_amount and reason=v_reason and created_by=p_actor) then raise exception 'AFFILIATE_IDEMPOTENCY_CONFLICT'; end if;
    return;
  end if;
  perform public._affiliate_audit(p_actor,'adjust',v_id::text,v_reason);
end;
$$;
create function public.admin_affiliate_commission_release(p_actor uuid,p_input jsonb) returns void language plpgsql security definer set search_path='' as $$
declare v_id bigint:=(p_input->>'commission_id')::bigint; v_decision text:=p_input->>'decision';
  v_reason text:=nullif(trim(p_input->>'reason'),''); v_old public.affiliate_commissions; v_payment public.payments; v_open boolean; v_lost boolean;
begin
  perform public._affiliate_require_admin(p_actor);
  if v_decision is null or v_decision not in ('release','void') or v_reason is null then raise exception 'INVALID_INPUT'; end if;
  -- Same lock order as the trigger and retry: payment, then commission.
  select p.* into strict v_payment from public.payments p join public.affiliate_commissions c on c.payment_id=p.id where c.id=v_id for update of p;
  select c.* into strict v_old from public.affiliate_commissions c where c.id=v_id for update;
  if v_decision='void' then
    if v_old.void_reason='admin_void' then return; end if;
    update public.affiliate_commissions set status='void',amount=0,void_reason='admin_void',updated_at=now() where id=v_id;
    insert into public.affiliate_commission_changes(commission_id,old_amount,new_amount,old_status,new_status,reason)
      values(v_id,v_old.amount,0,v_old.status,'void','admin_void');
  else
    if cardinality(v_old.flags)=0 or v_old.released_by is not null then raise exception 'AFFILIATE_NOT_FLAGGED'; end if;
    update public.affiliate_commissions set released_by=p_actor where id=v_id;
    select is_open,is_lost into strict v_open,v_lost from public._affiliate_dispute_state(v_payment);
    perform public._affiliate_write_commission(v_payment,null,v_old.level,v_open,v_lost,true);
  end if;
  perform public._affiliate_audit(p_actor,'commission_release',v_id::text,v_decision || ': ' || v_reason);
end;
$$;
create function public.admin_affiliate_payout_decide(p_actor uuid,p_input jsonb) returns void language plpgsql security definer set search_path='' as $$
declare v_id bigint:=(p_input->>'payout_id')::bigint; v_status text:=p_input->>'status'; v_note text:=nullif(trim(p_input->>'note'),'');
  v_method text:=nullif(trim(p_input->>'method'),''); v_ref text:=nullif(trim(p_input->>'paid_reference'),'');
  v_paid timestamptz:=(p_input->>'paid_at')::timestamptz;
begin
  perform public._affiliate_require_admin(p_actor);
  if v_status is null or v_status not in ('paid','held') or (v_status='held' and v_note is null)
     or (v_status='paid' and (v_paid is null or v_method is null or coalesce(v_ref,v_note) is null)) then raise exception 'INVALID_INPUT'; end if;
  update public.affiliate_payouts set status=v_status,paid_at=case when v_status='paid' then v_paid end,decided_by=p_actor,
    paid_method=case when v_status='paid' then v_method end,paid_reference=case when v_status='paid' then v_ref end,note=v_note
    where id=v_id and status='due';
  if not found then raise exception 'AFFILIATE_PAYOUT_NOT_DUE'; end if;
  perform public._affiliate_audit(p_actor,'payout_decide',v_id::text,v_status);
end;
$$;
create function public.admin_affiliate_settings(p_actor uuid,p_input jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
  perform public._affiliate_require_admin(p_actor);
  update public.affiliate_settings set enabled=coalesce((p_input->>'enabled')::boolean,enabled),
    hold_days=coalesce((p_input->>'hold_days')::integer,hold_days),
    payout_min_usd=coalesce((p_input->>'payout_min_usd')::bigint,payout_min_usd),
    settlement_day=coalesce((p_input->>'settlement_day')::integer,settlement_day),
    apply_min_level=coalesce(p_input->>'apply_min_level',apply_min_level),
    terms_version=coalesce(p_input->>'terms_version',terms_version) where singleton;
  insert into public.affiliate_rates(product_kind,l1_bp,l2_bp)
    select r.product_kind,r.l1_bp,r.l2_bp from jsonb_to_recordset(p_input->'rates') r(product_kind text,l1_bp integer,l2_bp integer)
    on conflict(product_kind) do update set l1_bp=excluded.l1_bp,l2_bp=excluded.l2_bp;
  perform public._affiliate_audit(p_actor,'settings','settings',p_input::text);
end;
$$;
create function public.admin_affiliate_recompute(p_actor uuid,p_payment_id bigint) returns void language plpgsql security definer set search_path='' as $$
begin
  perform public._affiliate_require_admin(p_actor);
  perform public.affiliate_recompute_payment(p_payment_id);
  perform public._affiliate_audit(p_actor,'recompute',p_payment_id::text);
end;
$$;

revoke all on function public.admin_affiliate_adjust(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.admin_affiliate_adjust(uuid,jsonb) to service_role;

revoke all on function public.admin_affiliate_commission_release(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.admin_affiliate_commission_release(uuid,jsonb) to service_role;

revoke all on function public.admin_affiliate_payout_decide(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.admin_affiliate_payout_decide(uuid,jsonb) to service_role;

revoke all on function public.admin_affiliate_settings(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.admin_affiliate_settings(uuid,jsonb) to service_role;

revoke all on function public.admin_affiliate_recompute(uuid,bigint) from public,anon,authenticated,service_role;
grant execute on function public.admin_affiliate_recompute(uuid,bigint) to service_role;
