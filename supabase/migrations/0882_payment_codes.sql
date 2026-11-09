-- Legacy callers can continue inserting payment rows without code effects.
alter table public.payments
  add column code_id uuid references public.codes(id) on delete set null,
  add column amount_discount integer not null default 0 check (amount_discount >= 0),
  add column code_discount_conflict boolean not null default false,
  add column code_effects_applied_at timestamptz;

create index payments_code_user_idx on public.payments(code_id, user_id) where code_id is not null;
