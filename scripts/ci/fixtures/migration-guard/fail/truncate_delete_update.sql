-- expect: truncate, delete, bulk-update, bulk-update
truncate table public.credit_ledger restart identity;
delete from public.generation_jobs where created_at < now() - interval '90 days';
update public.profiles set credits = 0;
update public.templates set quality = 'high' where credits_cost > 2;
