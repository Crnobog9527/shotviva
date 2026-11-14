-- T82 (ARCHITECTURE §6.3 「拒付申诉证据」): one row per Stripe dispute, written when
-- charge.dispute.created arrives (open_payment_dispute, 0727). It holds only what the admin
-- 「拒付」 page and the deadline reminder need; the evidence itself is staged on the Stripe
-- dispute (submit = false) and read back from Stripe, never copied here (AGENTS §5.1).
--
-- responder: who answers the issuing bank. 'shotviva' for plain Stripe card payments (中国银行卡
-- and the card fallback while Managed Payments is off): the Owner reviews and submits. 'stripe'
-- for Managed Payments, where Stripe decides and submits itself; we only stage evidence it may
-- use, and the page offers no submit (countering ourselves would cost an evidence fee).
-- Alipay / WeChat Pay have no chargebacks at all, so they never reach this table.
create table public.payment_disputes (
  stripe_dispute_id text primary key check (stripe_dispute_id ~ '^(dp|du)_'),
  stripe_charge_id text not null check (stripe_charge_id ~ '^(ch|py)_'),
  payment_id bigint references public.payments (id) on delete set null,
  user_id uuid references public.profiles (id) on delete set null,
  amount integer not null check (amount >= 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  reason text not null check (length(reason) > 0),
  responder text not null check (responder in ('shotviva', 'stripe')),
  -- Stripe's evidence_details.due_by; null when the bank allows no response.
  due_by timestamptz,
  -- When the user was banned because of this dispute (null: not banned by it, e.g. an admin).
  auto_banned_at timestamptz,
  evidence_drafted_at timestamptz,
  submitted_at timestamptz,
  submitted_by uuid references public.profiles (id) on delete set null,
  -- The one 「截止前 3 天还没提交」 reminder.
  reminded_at timestamptz,
  created_at timestamptz not null default now(),
  -- submitted_by may go null later (that admin's account deleted), never the other way round.
  check (submitted_by is null or submitted_at is not null)
);

alter table public.payment_disputes enable row level security;
-- Private (AGENTS §5): only the functions in 0727–0729 read and write it, like support_tickets.
revoke all on public.payment_disputes from public, anon, authenticated, service_role;

-- The admin list pages newest first by (created_at, id) (AGENTS §5.1 #4).
create index payment_disputes_created_at_idx on public.payment_disputes (created_at desc, stripe_dispute_id desc);
-- The reminder looks only at disputes we answer that are not submitted yet.
create index payment_disputes_unsubmitted_due_idx on public.payment_disputes (due_by)
  where submitted_at is null and responder = 'shotviva';
-- Evidence facts look the dispute's charge up on payments (payments has a unique index on
-- stripe_charge_id already), and the user's works by (user_id, created_at) (existing index).
