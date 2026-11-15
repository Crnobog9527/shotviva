-- 1569 (hotfix for 1568): the break-even budget is computed once per statement, not per call.
--
-- With the policy row present, admin.template_breakeven_budget() scanned the catalogue and every
-- product's fees (~34 ms) on each call. public.web_templates checks every template's sale floor
-- through it several times, so the catalogue read went past anon's statement timeout.
--
-- Same result, same signature: the calculation moves unchanged into
-- admin.template_breakeven_budget_now(); admin.template_breakeven_budget() keeps its value for
-- the rest of the current client statement in a transaction-local setting (set_config(..., true):
-- gone at commit or rollback) keyed by statement_timestamp(). Every later statement (in the same
-- transaction or not) computes afresh, so a policy, catalogue or affiliate change is seen by the next statement,
-- exactly as before. Within one statement the inputs are the same snapshot for these stable
-- functions in practice; the only difference would be a single statement that both rewrites the
-- policy or catalogue and then reads a floor, which no caller does.
-- Expand-only: one new private function, one body replaced with the same signature and result.

create function admin.template_breakeven_budget_now() returns numeric
  language sql stable security definer set search_path to '' as $$
  select case when admin.is_template_catalog_v2() and admin.template_policy_valid() then (
    select min(i.cents/(100*i.credits::numeric) * (10000-admin.catalog_fee_bp(i.kind))/10000)
      from (select c.kind, c.credits,
              case when c.id in ('pack_m','pack_l') then round(c.cents*0.85) else c.cents end as cents
            from admin.catalog_candidate(null,null,null,false) c) i
     where i.cents>0 and i.credits>0) end
$$;

revoke all on function admin.template_breakeven_budget_now() from public, anon, authenticated;
grant execute on function admin.template_breakeven_budget_now() to service_role;

create or replace function admin.template_breakeven_budget() returns numeric
  language plpgsql stable security definer set search_path to '' as $$
declare
  stamp text := statement_timestamp()::text;
  cached text := current_setting('shotviva.breakeven_budget', true);
  budget numeric;
begin
  -- Only a value written during this very statement counts: a value left by an earlier statement
  -- (or set by anyone before it) carries another timestamp and is recomputed. Anything that does
  -- not look like what this function writes is ignored too. Clients cannot set it at all: the
  -- API exposes no way to call set_config, and the setting is not in PostgREST's request.* space.
  if cached is not null and split_part(cached, '|', 1) = stamp
     and split_part(cached, '|', 2) ~ '^([0-9]+(\.[0-9]+)?)?$' and cached ~ '^[^|]+\|[^|]*$' then
    return nullif(split_part(cached, '|', 2), '')::numeric;
  end if;
  budget := admin.template_breakeven_budget_now();
  perform set_config('shotviva.breakeven_budget', stamp || '|' || coalesce(budget::text, ''), true);
  return budget;
end;
$$;
