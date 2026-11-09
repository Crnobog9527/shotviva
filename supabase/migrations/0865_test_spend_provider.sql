-- The panel trims run rows after 30 days (or 50 per template), while the cost ledger lives
-- for 100 days. Keep the provider/model on the ledger even after the corresponding run is gone.
alter table public.admin_test_spend
  add column provider text,
  add column has_openrouter boolean not null default false;

-- Existing runs predate OpenRouter. A spent row whose run was already trimmed stays unattributed.
update public.admin_test_spend s set provider = r.provider
  from public.admin_test_runs r where r.id = s.run_id;

create function public.snapshot_test_spend_provider() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_snapshot record;
begin
  select r.provider, coalesce(r.provider_usage ?| array['cost', 'prompt_tokens', 'completion_tokens'], false) as has_openrouter
    into v_snapshot
    from public.admin_test_runs r where r.id = new.run_id;
  if found then
    new.provider := v_snapshot.provider;
    new.has_openrouter := v_snapshot.has_openrouter;
  end if;
  return new;
end;
$$;

create trigger admin_test_spend_snapshot_provider before insert or update of cost_usd on public.admin_test_spend
  for each row execute function public.snapshot_test_spend_provider();
revoke all on function public.snapshot_test_spend_provider() from public, anon, authenticated;
