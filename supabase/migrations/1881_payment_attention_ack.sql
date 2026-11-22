-- 「标记已知晓」 on refunded / disputed payments (ARCHITECTURE §10 订单与收入, the Owner 2026-11-22):
-- the overview counter 「退款和争议（60 天内）」 kept counting the Owner's own test refunds. An admin
-- marks a payment as known and it leaves the counter; nothing about money, refunds or clawbacks
-- changes. The mark records the payment state it was given for (status and amount refunded): when
-- either changes later (a second refund, a new dispute), the payment counts again by itself.
--
-- This file only adds structure: four nullable columns on payments and two audit actions widened
-- from what they are now. Code running before the deploy never reads them.

alter table public.payments
  add column acknowledged_at timestamptz,
  add column acknowledged_by uuid references public.profiles(id) on delete set null,
  add column acknowledged_status text,
  add column acknowledged_refunded integer;

-- Set and cleared together by admin_acknowledge_payment / admin_unacknowledge_payment (1882);
-- acknowledged_by alone may turn null later if that admin's profile is deleted.
alter table public.payments
  add constraint payments_acknowledged_check check (
    (acknowledged_at is null) = (acknowledged_status is null)
    and (acknowledged_at is null) = (acknowledged_refunded is null)
    and (acknowledged_at is not null or acknowledged_by is null)
  );

do $$
declare
  v_actions text[];
begin
  select array_agg(m[1] order by ord) into v_actions
    from pg_constraint c,
         regexp_matches(pg_get_constraintdef(c.oid), '''([a-z0-9_]+)''', 'g') with ordinality as t(m, ord)
   where c.conrelid = 'public.admin_audit_log'::regclass and c.conname = 'admin_audit_log_action_check';
  if v_actions is null or cardinality(v_actions) < 10 or not 'clawback_payment' = any(v_actions) then
    raise exception 'admin_audit_log_action_check not found or unreadable';
  end if;
  if not 'payment_acknowledge' = any(v_actions) then v_actions := array_append(v_actions, 'payment_acknowledge'); end if;
  if not 'payment_unacknowledge' = any(v_actions) then v_actions := array_append(v_actions, 'payment_unacknowledge'); end if;
  execute 'alter table public.admin_audit_log drop constraint admin_audit_log_action_check';
  execute 'alter table public.admin_audit_log add constraint admin_audit_log_action_check check (action in ('
    || (select string_agg(quote_literal(a), ',' order by o) from unnest(v_actions) with ordinality u(a, o)) || '))';
end;
$$;
