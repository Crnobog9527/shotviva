-- Quote the purchase ledger in dispute evidence even after the catalog changes.
create or replace function public.dispute_evidence_facts(p_dispute_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_dispute public.payment_disputes;
  v_payment public.payments;
  v_context public.payments;
  v_user jsonb;
  v_works jsonb;
  v_totals jsonb;
begin
  select * into v_dispute from public.payment_disputes where stripe_dispute_id = p_dispute_id;
  if not found then
    raise exception 'DISPUTE_NOT_FOUND';
  end if;

  select * into v_payment from public.payments where id = v_dispute.payment_id;
  if v_payment.id is not null then
    v_context := v_payment;
    if v_payment.purchase_ip is null and v_payment.terms_accepted_at is null then
      select * into v_context from public.payments p
       where p.user_id = v_payment.user_id and p.product_id = v_payment.product_id
         and p.channel = 'stripe' and p.stripe_session_id is not null
         and p.created_at <= v_payment.created_at
       order by p.created_at desc limit 1;
    end if;
  end if;

  select jsonb_build_object(
           'id', u.id, 'email', nullif(u.email, ''), 'signed_up_at', u.created_at,
           'signup_ip', host(p.signup_ip), 'banned_at', p.banned_at)
    into v_user
    from auth.users u join public.profiles p on p.id = u.id
   where u.id = v_dispute.user_id;

  if v_payment.id is not null then
    select coalesce(jsonb_agg(w order by w.created_at), '[]'::jsonb) into v_works
      from (
        select g.created_at, host(g.client_ip) as client_ip, g.template_id, g.credits_cost,
               g.inputs ->> 'resolution' as resolution,
               g.downloaded_at, host(g.download_ip) as download_ip, g.download_count
          from public.generation_jobs g
         where g.user_id = v_payment.user_id and g.status = 'succeeded' and g.credit_pool = 'paid'
           and g.created_at >= v_payment.created_at and g.created_at <= v_dispute.created_at
         order by g.created_at
         limit 200
      ) w;
    select jsonb_build_object('count', count(*), 'credits', coalesce(sum(g.credits_cost), 0),
             'downloaded', count(*) filter (where g.download_count > 0))
      into v_totals
      from public.generation_jobs g
     where g.user_id = v_payment.user_id and g.status = 'succeeded' and g.credit_pool = 'paid'
       and g.created_at >= v_payment.created_at and g.created_at <= v_dispute.created_at;
  end if;

  return jsonb_build_object(
    'dispute', jsonb_build_object('id', v_dispute.stripe_dispute_id, 'charge_id', v_dispute.stripe_charge_id,
      'amount', v_dispute.amount, 'currency', v_dispute.currency, 'reason', v_dispute.reason,
      'responder', v_dispute.responder, 'created_at', v_dispute.created_at),
    'user', v_user,
    'payment', case when v_payment.id is null then null else jsonb_build_object(
      'id', v_payment.id, 'product_id', v_payment.product_id, 'method', v_payment.method,
      'granted_credits', public._payment_granted_credits(v_payment),
      'amount_total', v_payment.amount_total, 'currency', v_payment.currency,
      'created_at', v_payment.created_at, 'renewal', v_payment.stripe_session_id is null,
      'purchase_ip', host(v_context.purchase_ip), 'purchase_user_agent', v_context.purchase_user_agent,
      'terms_accepted_at', v_context.terms_accepted_at,
      'context_from', case when v_context.id is null then null when v_context.id = v_payment.id then 'this_payment' else 'first_payment' end)
    end,
    'works', coalesce(v_works, '[]'::jsonb),
    'totals', coalesce(v_totals, jsonb_build_object('count', 0, 'credits', 0, 'downloaded', 0))
  );
end;
$$;
