-- F2 (ARCHITECTURE §6.2 联盟返佣 · 订单手续费): the only writers of payment_fee_lines and
-- payment_fee_schedules, and the readers F3–F6 build on. All amounts are integer USD cents.
-- Every function is service-role only; the _ helpers are granted to nobody.

-- One fee item at a published rate: rate × basis rounded to the cent (half up, or up for
-- Waffo), plus the fixed part. basis is the tax-inclusive charged amount in USD cents.
create function public.payment_fee_amount(p_basis_cents bigint, p_rate_bp integer, p_fixed_cents integer, p_rounding text)
returns integer language plpgsql immutable set search_path='' as $$
begin
  if p_basis_cents is null or p_basis_cents < 0 or p_rate_bp is null or p_rate_bp not between 0 and 10000
     or p_fixed_cents is null or p_fixed_cents < 0 or p_rounding is null or p_rounding not in ('half_up','ceil') then
    raise exception 'INVALID_INPUT' using detail = 'payment_fee_amount: basis, rate, fixed and rounding are required';
  end if;
  return (case when p_rounding = 'ceil' then (p_basis_cents * p_rate_bp + 9999) / 10000
               else (p_basis_cents * p_rate_bp + 5000) / 10000 end + p_fixed_cents)::integer;
end;
$$;
revoke all on function public.payment_fee_amount(bigint,integer,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.payment_fee_amount(bigint,integer,integer,text) to service_role;

-- The rate in force at p_at (normally the payment's created_at); NULL fields when there is none.
create function public.payment_fee_schedule_for(p_channel text, p_method text, p_kind text, p_at timestamptz)
returns public.payment_fee_schedules language sql stable security definer set search_path='' as $$
  select s.* from public.payment_fee_schedules s
   where s.channel = p_channel and s.method = p_method and s.kind = p_kind and s.active and s.effective_from <= p_at
   order by s.effective_from desc, s.id desc
   limit 1;
$$;
revoke all on function public.payment_fee_schedule_for(text,text,text,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.payment_fee_schedule_for(text,text,text,timestamptz) to service_role;

-- The lines that count now: the latest revision of the charge scope and of each refund scope.
create function public.payment_fee_lines_current(p_payment_id bigint)
returns setof public.payment_fee_lines language sql stable security definer set search_path='' as $$
  select l.* from public.payment_fee_lines l
   where l.payment_id = p_payment_id
     and l.revision = (select max(m.revision) from public.payment_fee_lines m
                        where m.payment_id = l.payment_id and coalesce(m.refund_id,'') = coalesce(l.refund_id,''))
   order by l.refund_id nulls first, l.line_no;
$$;
revoke all on function public.payment_fee_lines_current(bigint) from public,anon,authenticated,service_role;
grant execute on function public.payment_fee_lines_current(bigint) to service_role;

-- payments.fee_cents / fee_status follow the current lines; only the fee columns are set, so the
-- affiliate trigger (after update of status, amount_refunded) does not fire from here.
create function public._payment_fee_refresh(p_payment_id bigint) returns void
language sql security definer set search_path='' as $$
  update public.payments p
     set fee_cents = c.total, fee_status = c.status
    from (select coalesce(sum(amount_cents), 0)::integer as total,
                 case when bool_or(status = 'estimated') then 'estimated' else 'final' end as status
            from public.payment_fee_lines_current(p_payment_id)) c
   where p.id = p_payment_id and (p.fee_cents, p.fee_status) is distinct from (c.total, c.status);
$$;
revoke all on function public._payment_fee_refresh(bigint) from public,anon,authenticated,service_role;

-- Checks one input line and prices it when it is not a real-bill line. Returns the stored shape.
create function public._payment_fee_line(p_payment public.payments, p_line jsonb, p_no integer, p_refund text, p_basis bigint)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_kind text := p_line->>'kind';
  v_source text := p_line->>'source';
  v_status text := coalesce(p_line->>'status', case when p_line->>'source' in ('estimate','formula') then 'estimated' else 'final' end);
  v_amount bigint := (p_line->>'amount_cents')::bigint;
  v_sched public.payment_fee_schedules;
begin
  if jsonb_typeof(p_line) is distinct from 'object'
     or v_kind is null or v_kind not in ('acquiring','intl_card','fx','mp','billing','radar','refund_fee','other')
     or v_source is null or v_source not in ('estimate','stripe_bt','waffo_settlement','formula')
     or v_status not in ('estimated','final') or v_amount < 0
     or (v_source = 'estimate' and v_status <> 'estimated')
     or (v_source in ('stripe_bt','waffo_settlement') and v_status <> 'final')
     or (v_source = 'stripe_bt' and p_payment.channel <> 'stripe')
     or (v_source = 'waffo_settlement' and p_payment.channel <> 'waffo')
     or ((v_kind = 'refund_fee') <> (p_refund is not null)) then
    raise exception 'INVALID_INPUT' using detail = 'payment_fee_record: bad line ' || p_no;
  end if;
  if p_line->>'schedule_id' is not null then
    select * into v_sched from public.payment_fee_schedules where id = (p_line->>'schedule_id')::bigint;
    if not found or v_sched.channel <> p_payment.channel or v_sched.method <> p_payment.method or v_sched.kind <> v_kind then
      raise exception 'PAYMENT_FEE_SCHEDULE_MISMATCH' using detail = 'line ' || p_no;
    end if;
  end if;
  -- Real-bill lines without an amount are split from actual_cents afterwards.
  if v_amount is null and v_source not in ('stripe_bt','waffo_settlement') then
    if v_sched.id is null or p_basis is null then
      raise exception 'INVALID_INPUT' using detail = 'line ' || p_no || ' needs amount_cents, or schedule_id and basis_cents';
    end if;
    v_amount := public.payment_fee_amount(p_basis, v_sched.rate_bp, v_sched.fixed_cents, v_sched.rounding);
  end if;
  return jsonb_build_object('line_no', p_no, 'kind', v_kind, 'source', v_source, 'status', v_status,
    'schedule_id', v_sched.id, 'rate_bp', v_sched.rate_bp, 'fixed_cents', v_sched.fixed_cents,
    'rounding', v_sched.rounding, 'amount_cents', v_amount,
    'source_ref', nullif(p_line->>'source_ref',''), 'note', nullif(p_line->>'note',''));
end;
$$;
revoke all on function public._payment_fee_line(public.payments,jsonb,integer,text,bigint) from public,anon,authenticated,service_role;

-- Real-bill lines must add up to the provider's actual fee exactly. Lines given an amount keep
-- it; the other lines are priced from their schedule (capped at what is left, in input order);
-- the one acquiring line (in a refund scope: the refund_fee line) takes the residual, so it
-- absorbs rounding.
create function public._payment_fee_split(p_lines jsonb, p_actual bigint, p_basis bigint)
returns jsonb language plpgsql immutable set search_path='' as $$
declare
  v_lines jsonb := p_lines;
  v_left bigint := p_actual;
  v_residual integer;
  v_item jsonb;
  v_amount bigint;
  i integer;
begin
  for i in 0 .. jsonb_array_length(v_lines) - 1 loop
    v_item := v_lines->i;
    if v_item->>'source' in ('stripe_bt','waffo_settlement') and v_item->'amount_cents' <> 'null' then
      v_left := v_left - (v_item->>'amount_cents')::bigint;
    end if;
  end loop;
  if v_left < 0 then raise exception 'PAYMENT_FEE_SPLIT' using detail = 'fixed real lines exceed actual_cents'; end if;
  select count(*) filter (where e->>'kind' in ('acquiring','refund_fee')), count(*)
    into v_residual, i
    from jsonb_array_elements(v_lines) e
   where e->>'source' in ('stripe_bt','waffo_settlement') and e->'amount_cents' = 'null';
  if (i = 0 and v_left <> 0) or (i > 0 and v_residual <> 1) then
    raise exception 'PAYMENT_FEE_SPLIT' using detail = 'one real acquiring (or refund_fee) line without amount must take the residual';
  end if;
  v_residual := null;
  for i in 0 .. jsonb_array_length(v_lines) - 1 loop
    v_item := v_lines->i;
    continue when v_item->>'source' not in ('stripe_bt','waffo_settlement') or v_item->'amount_cents' <> 'null';
    if v_item->>'kind' in ('acquiring','refund_fee') then v_residual := i; continue; end if;
    if v_item->'schedule_id' = 'null' or p_basis is null then
      raise exception 'INVALID_INPUT' using detail = 'line ' || (v_item->>'line_no') || ' needs amount_cents, or schedule_id and basis_cents';
    end if;
    v_amount := least(v_left, public.payment_fee_amount(p_basis, (v_item->>'rate_bp')::integer,
      (v_item->>'fixed_cents')::integer, v_item->>'rounding'));
    v_left := v_left - v_amount;
    v_lines := jsonb_set(v_lines, array[i::text, 'amount_cents'], to_jsonb(v_amount));
  end loop;
  if v_residual is not null then
    v_lines := jsonb_set(v_lines, array[v_residual::text, 'amount_cents'], to_jsonb(v_left));
  end if;
  return v_lines;
end;
$$;
revoke all on function public._payment_fee_split(jsonb,bigint,bigint) from public,anon,authenticated,service_role;

-- Writes one revision of a payment's fees (the charge's own fees, or one refund's fee).
-- p_input: payment_id, idempotency_key, refund_id (refund scope only), basis_cents (tax-
-- inclusive USD cents, for priced lines), actual_cents (the provider's real fee, exactly when
-- the set has stripe_bt / waffo_settlement lines), lines[1..20] of {kind, source, status?,
-- schedule_id?, amount_cents?, source_ref?, note?}.
-- Returns {applied, reason?, revision, fee_cents, fee_status, lines?}. Not applied, nothing
-- written: 'replayed' (this key was already written), 'legacy' (payment before record_from),
-- 'final' (an estimate never replaces a final revision).
create function public.payment_fee_record(p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_key text := p_input->>'idempotency_key';
  v_refund text := nullif(p_input->>'refund_id','');
  v_basis bigint := (p_input->>'basis_cents')::bigint;
  v_actual bigint := (p_input->>'actual_cents')::bigint;
  v_payment public.payments;
  v_seen public.payment_fee_lines;
  v_from timestamptz;
  v_rev integer;
  v_final boolean;
  v_lines jsonb := '[]';
  v_line jsonb;
  v_no integer;
begin
  if jsonb_typeof(p_input) is distinct from 'object' or v_key is null or length(v_key) not between 1 and 200
     or p_input->>'payment_id' is null or v_basis < 0 or v_actual < 0
     or length(v_refund) > 200 or jsonb_typeof(p_input->'lines') is distinct from 'array'
     or jsonb_array_length(p_input->'lines') not between 1 and 20 then
    raise exception 'INVALID_INPUT' using detail = 'payment_fee_record: bad input';
  end if;
  -- Same lock as affiliate_recompute_payment: fee writes and commission recomputes serialise.
  select * into v_payment from public.payments where id = (p_input->>'payment_id')::bigint for update;
  if not found then raise exception 'NOT_FOUND'; end if;

  select * into v_seen from public.payment_fee_lines where idempotency_key = v_key limit 1;
  if found then
    if v_seen.payment_id <> v_payment.id or v_seen.refund_id is distinct from v_refund then
      raise exception 'PAYMENT_FEE_KEY_CONFLICT';
    end if;
    return jsonb_build_object('applied', false, 'reason', 'replayed', 'revision', v_seen.revision,
      'fee_cents', v_payment.fee_cents, 'fee_status', v_payment.fee_status);
  end if;

  select record_from into v_from from public.payment_fee_settings where singleton;
  if v_from is null or v_payment.created_at < v_from then
    return jsonb_build_object('applied', false, 'reason', 'legacy', 'fee_cents', null, 'fee_status', null);
  end if;

  for v_line, v_no in select e, o from jsonb_array_elements(p_input->'lines') with ordinality t(e, o) loop
    v_lines := v_lines || jsonb_build_array(public._payment_fee_line(v_payment, v_line, v_no::integer, v_refund, v_basis));
  end loop;
  if exists(select from jsonb_array_elements(v_lines) e where e->>'source' in ('stripe_bt','waffo_settlement')) <> (v_actual is not null) then
    raise exception 'INVALID_INPUT' using detail = 'actual_cents goes with real-bill lines, and only with them';
  end if;
  if v_actual is not null then v_lines := public._payment_fee_split(v_lines, v_actual, v_basis); end if;

  select coalesce(max(revision), 0) into v_rev from public.payment_fee_lines
   where payment_id = v_payment.id and coalesce(refund_id,'') = coalesce(v_refund,'');
  select bool_and(status = 'final') into v_final from public.payment_fee_lines
   where payment_id = v_payment.id and coalesce(refund_id,'') = coalesce(v_refund,'') and revision = v_rev;
  if v_final and exists(select from jsonb_array_elements(v_lines) e where e->>'status' = 'estimated') then
    return jsonb_build_object('applied', false, 'reason', 'final', 'revision', v_rev,
      'fee_cents', v_payment.fee_cents, 'fee_status', v_payment.fee_status);
  end if;

  insert into public.payment_fee_lines (payment_id, refund_id, revision, line_no, kind, channel, schedule_id, rate_bp,
      fixed_cents, amount_cents, source, status, source_ref, idempotency_key, note)
    select v_payment.id, v_refund, v_rev + 1, (e->>'line_no')::smallint, e->>'kind', v_payment.channel,
           (e->>'schedule_id')::bigint, (e->>'rate_bp')::integer, (e->>'fixed_cents')::integer,
           (e->>'amount_cents')::integer, e->>'source', e->>'status', e->>'source_ref', v_key, e->>'note'
      from jsonb_array_elements(v_lines) e;
  perform public._payment_fee_refresh(v_payment.id);
  select * into v_payment from public.payments where id = v_payment.id;
  return jsonb_build_object('applied', true, 'revision', v_rev + 1, 'fee_cents', v_payment.fee_cents,
    'fee_status', v_payment.fee_status,
    'lines', (select jsonb_agg(e - 'rounding' order by (e->>'line_no')::integer) from jsonb_array_elements(v_lines) e));
end;
$$;
revoke all on function public.payment_fee_record(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.payment_fee_record(jsonb) to service_role;

-- Admin: add a rate version (no id), or switch a version on/off and edit its note (id). Rates,
-- method, kind and effective date never change in place. Audited like the payout fee rules.
create function public.admin_payment_fee_schedule_save(p_actor uuid, p_input jsonb) returns bigint
language plpgsql security definer set search_path='' as $$
declare
  v_id bigint := (p_input->>'id')::bigint;
  v_old public.payment_fee_schedules;
  v_new public.payment_fee_schedules;
begin
  perform public._affiliate_require_admin(p_actor);
  if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'INVALID_INPUT'; end if;
  begin
    if v_id is null then
      insert into public.payment_fee_schedules (channel, method, kind, rate_bp, fixed_cents, rounding, effective_from,
          active, note, created_by, updated_by)
        values (p_input->>'channel', p_input->>'method', p_input->>'kind', coalesce((p_input->>'rate_bp')::integer, 0),
          coalesce((p_input->>'fixed_cents')::integer, 0), coalesce(p_input->>'rounding', 'half_up'),
          coalesce((p_input->>'effective_from')::timestamptz, now()), coalesce((p_input->>'active')::boolean, true),
          nullif(trim(p_input->>'note'), ''), p_actor, p_actor)
        returning * into v_new;
    else
      if exists(select from jsonb_object_keys(p_input) k where k not in ('id','active','note','expected_updated_at')) then
        raise exception 'PAYMENT_FEE_SCHEDULE_IMMUTABLE';
      end if;
      select * into v_old from public.payment_fee_schedules where id = v_id for update;
      if not found then raise exception 'NOT_FOUND'; end if;
      if p_input ? 'expected_updated_at' and (p_input->>'expected_updated_at')::timestamptz is distinct from v_old.updated_at then
        raise exception 'PAYMENT_FEE_SCHEDULE_CHANGED';
      end if;
      update public.payment_fee_schedules
         set active = coalesce((p_input->>'active')::boolean, v_old.active),
             note = case when p_input ? 'note' then nullif(trim(p_input->>'note'), '') else v_old.note end,
             updated_at = now(), updated_by = p_actor
       where id = v_id
       returning * into v_new;
    end if;
  exception when unique_violation then
    raise exception 'PAYMENT_FEE_SCHEDULE_EXISTS';
  end;
  perform public._affiliate_audit(p_actor, 'settings', 'payment_fee_schedule:' || v_new.id,
    jsonb_build_object('payment_fee_schedule', v_new.id,
      'before', case when v_old.id is not null then to_jsonb(v_old) end, 'after', to_jsonb(v_new))::text);
  return v_new.id;
end;
$$;
revoke all on function public.admin_payment_fee_schedule_save(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.admin_payment_fee_schedule_save(uuid,jsonb) to service_role;
