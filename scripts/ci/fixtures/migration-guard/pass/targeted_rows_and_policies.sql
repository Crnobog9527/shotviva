-- expect: none
-- Targeted catalog fixes by literal key, and policies / triggers / indexes replaced in place.
update public.products set price_usd = 191.00 where id = 'starter_yearly';
update public.products p set active = true where p.id in ('pro', 'max') and p.currency = 'usd';
drop policy if exists "templates are readable" on public.templates;
create policy "templates are readable" on public.templates for select using (is_active);
drop trigger if exists templates_touch on public.templates;
drop index if exists public.templates_old_idx;
create view public.tmp_report as select 1 as n;
drop view public.tmp_report;
select * from public.payments for update skip locked;
grant select, update (title) on public.templates to service_role;
