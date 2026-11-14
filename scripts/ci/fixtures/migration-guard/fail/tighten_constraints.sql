-- expect: set-not-null, add-constraint, add-constraint, unique-index, add-not-null-column, type-change, drop-default
alter table public.profiles alter column display_name set not null;
alter table public.payments add constraint payments_amount_positive check (amount_usd > 0);
alter table public.profiles add unique (email);
create unique index profiles_phone_key on public.profiles (phone);
alter table public.templates add column category text not null;
alter table public.templates alter column credits_cost type jsonb using to_jsonb(credits_cost);
alter table public.templates alter column quality drop default;
