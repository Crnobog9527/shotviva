-- Payout fee rules: the copy stored on a statement, the deterministic quote, read helpers and the
-- admin save RPC (ARCHITECTURE §6.2 联盟返佣 · 打款扣费).

create or replace function public._affiliate_fee_rule_json(r public.affiliate_payout_fee_rules) returns jsonb
language sql immutable set search_path='' as $$
  select jsonb_build_object('id',r.id,'label_zh',r.label_zh,'label_en',r.label_en,'kind',r.kind,
    'percent_bp',r.percent_bp,'fixed_cents',r.fixed_cents,'min_cents',r.min_cents,'max_cents',r.max_cents,
    'payout_methods',to_jsonb(r.payout_methods),'effective_from',r.effective_from);
$$;
revoke all on function public._affiliate_fee_rule_json(public.affiliate_payout_fee_rules) from public,anon,authenticated,service_role;

-- Rules in force for one program at one moment, in the order they are applied. p_method NULL
-- (no payout method yet) keeps only rules without a method filter.
create or replace function public.affiliate_payout_fee_rules_for(p_program text, p_method text, p_at timestamptz) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(public._affiliate_fee_rule_json(r) order by r.sort_order,r.id),'[]'::jsonb)
    from public.affiliate_payout_fee_rules r
   where r.program=p_program and r.active and r.effective_from<=p_at
     and (r.payout_methods is null or p_method=any(r.payout_methods));
$$;
revoke all on function public.affiliate_payout_fee_rules_for(text,text,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.affiliate_payout_fee_rules_for(text,text,timestamptz) to service_role;

-- Deterministic fee quote, all integer cents. Every rule is computed on the gross (rules never
-- compound): percent part rounded half up to the cent, plus the fixed part, then raised to min and
-- lowered to max. Rules are applied in array order and each takes at most what is left, so the
-- total never exceeds the gross and net is never negative.
create or replace function public.affiliate_payout_fee_quote(p_rules jsonb, p_gross bigint) returns jsonb
language plpgsql immutable set search_path='' as $$
declare r jsonb; v_left bigint:=p_gross; v_fee bigint; v_lines jsonb:='[]'::jsonb;
begin
  if p_gross is null or p_gross<0 or (p_rules is not null and jsonb_typeof(p_rules)<>'array') then
    raise exception 'INVALID_INPUT'; end if;
  for r in select e.value from jsonb_array_elements(coalesce(p_rules,'[]'::jsonb)) with ordinality e(value,n) order by e.n loop
    v_fee:=div(p_gross::numeric*coalesce((r->>'percent_bp')::integer,0)+5000,10000)::bigint
      +coalesce((r->>'fixed_cents')::bigint,0);
    if r->>'min_cents' is not null then v_fee:=greatest(v_fee,(r->>'min_cents')::bigint); end if;
    if r->>'max_cents' is not null then v_fee:=least(v_fee,(r->>'max_cents')::bigint); end if;
    v_fee:=least(greatest(v_fee,0),v_left);
    v_left:=v_left-v_fee;
    v_lines:=v_lines||jsonb_build_array(r||jsonb_build_object('amount',v_fee));
  end loop;
  return jsonb_build_object('gross',p_gross,'fees',p_gross-v_left,'net',v_left,'lines',v_lines);
end;
$$;
revoke all on function public.affiliate_payout_fee_quote(jsonb,bigint) from public,anon,authenticated,service_role;
grant execute on function public.affiliate_payout_fee_quote(jsonb,bigint) to service_role;

-- Fees of one statement (PostgREST computed column). Paid: what was recorded (legacy rows have no
-- fees). Due / held: the issued rules applied to the amount payable right now. Void: NULL.
create or replace function public.affiliate_payout_fees(p public.affiliate_payouts) returns jsonb
language sql stable security definer set search_path='' as $$
  select case
    when p.status='paid' then jsonb_build_object('gross',coalesce(p.paid_amount,p.amount),'fees',coalesce(p.fee_amount,0),
      'net',coalesce(p.paid_amount,p.amount)-coalesce(p.fee_amount,0),'lines',coalesce(p.fee_lines,'[]'::jsonb))
    when p.status in ('due','held') then
      public.affiliate_payout_fee_quote(p.fee_rules,coalesce(public.affiliate_payout_payable(p),p.amount))
  end;
$$;
revoke all on function public.affiliate_payout_fees(public.affiliate_payouts) from public,anon,authenticated,service_role;
grant execute on function public.affiliate_payout_fees(public.affiliate_payouts) to service_role;

-- What /partners shows: every rule in force (any method) and the estimate for the current
-- available balance under the affiliate's own payout method.
create or replace function public.affiliate_partner_fees(p_user uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('method',a.payout_method,
    'rules',(select coalesce(jsonb_agg(public._affiliate_fee_rule_json(r) order by r.sort_order,r.id),'[]'::jsonb)
      from public.affiliate_payout_fee_rules r where r.program='standard' and r.active and r.effective_from<=now()),
    'estimate',public.affiliate_payout_fee_quote(
      public.affiliate_payout_fee_rules_for('standard',a.payout_method,now()),greatest(b.available,0)))
  from public.affiliates a join public.affiliate_balances b on b.affiliate_user_id=a.user_id
  where a.user_id=p_user;
$$;
revoke all on function public.affiliate_partner_fees(uuid) from public,anon,authenticated,service_role;
grant execute on function public.affiliate_partner_fees(uuid) to service_role;

-- Add (no id) or edit one rule. Rules are never deleted; `active=false` retires one. Edits never
-- touch issued statements, which keep their own copy. expected_updated_at rejects a stale form.
create or replace function public.admin_affiliate_fee_rule_save(p_actor uuid, p_input jsonb) returns bigint
language plpgsql security definer set search_path='' as $$
declare v_id bigint:=(p_input->>'id')::bigint; v_old public.affiliate_payout_fee_rules; v_new public.affiliate_payout_fee_rules;
  v_methods text[]; v_from timestamptz:=(p_input->>'effective_from')::timestamptz;
begin
  perform public._affiliate_require_admin(p_actor);
  if jsonb_typeof(p_input->'payout_methods') not in ('array','null') then raise exception 'INVALID_INPUT'; end if;
  if jsonb_typeof(p_input->'payout_methods')='array' and jsonb_array_length(p_input->'payout_methods')>0 then
    v_methods:=array(select jsonb_array_elements_text(p_input->'payout_methods'));
  end if;
  if v_id is null then
    insert into public.affiliate_payout_fee_rules(label_zh,label_en,kind,percent_bp,fixed_cents,min_cents,max_cents,
        payout_methods,active,effective_from,sort_order,created_by,updated_by)
      values(trim(p_input->>'label_zh'),trim(p_input->>'label_en'),p_input->>'kind',coalesce((p_input->>'percent_bp')::integer,0),
        coalesce((p_input->>'fixed_cents')::bigint,0),(p_input->>'min_cents')::bigint,(p_input->>'max_cents')::bigint,
        v_methods,coalesce((p_input->>'active')::boolean,true),coalesce(v_from,now()),coalesce((p_input->>'sort_order')::integer,0),
        p_actor,p_actor)
      returning * into v_new;
  else
    select * into v_old from public.affiliate_payout_fee_rules where id=v_id for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    if p_input ? 'expected_updated_at' and (p_input->>'expected_updated_at')::timestamptz is distinct from v_old.updated_at then
      raise exception 'AFFILIATE_FEE_RULE_CHANGED'; end if;
    -- A rule already in force cannot be pushed into the future: it would stop applying until then
    -- and statements issued meanwhile would take no fee. A future change is a new rule plus
    -- disabling this one on that date.
    if v_old.effective_from<=now() and coalesce(v_from,v_old.effective_from)>now() then
      raise exception 'AFFILIATE_FEE_RULE_IN_FORCE'; end if;
    update public.affiliate_payout_fee_rules set label_zh=trim(p_input->>'label_zh'),label_en=trim(p_input->>'label_en'),
        kind=p_input->>'kind',percent_bp=coalesce((p_input->>'percent_bp')::integer,0),fixed_cents=coalesce((p_input->>'fixed_cents')::bigint,0),
        min_cents=(p_input->>'min_cents')::bigint,max_cents=(p_input->>'max_cents')::bigint,payout_methods=v_methods,
        active=coalesce((p_input->>'active')::boolean,v_old.active),effective_from=coalesce(v_from,v_old.effective_from),
        sort_order=coalesce((p_input->>'sort_order')::integer,v_old.sort_order),updated_at=now(),updated_by=p_actor
      where id=v_id returning * into v_new;
  end if;
  perform public._affiliate_audit(p_actor,'settings','fee_rule:'||v_new.id,
    jsonb_build_object('fee_rule',v_new.id,'before',case when v_old.id is not null then
        public._affiliate_fee_rule_json(v_old)||jsonb_build_object('active',v_old.active) end,
      'after',public._affiliate_fee_rule_json(v_new)||jsonb_build_object('active',v_new.active))::text);
  return v_new.id;
end;
$$;
revoke all on function public.admin_affiliate_fee_rule_save(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.admin_affiliate_fee_rule_save(uuid,jsonb) to service_role;
