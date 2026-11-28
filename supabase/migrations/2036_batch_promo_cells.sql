-- Batch create with promotion credits (Owner 2026-11-28): an active member of an active org that
-- runs the enterprise affiliate program may make 1K batch cells, paid from the org's promotion
-- share (the tier still decides the pool, 1996: 1K = free pool = promotion share for a member).
-- Everyone else keeps the paid-only batch (ARCHITECTURE §批量上传的语义): a free cell is refused,
-- so a plain account's free credits never reach a batch. The org must have its workspace on
-- (orgs.status = 'active'): only then does a seat's 1K draw the org's promotion share alone; with
-- the workspace off a seat's 1K may draw the member's own free credits (2034), so it stays refused.
--
-- Expand-only: one new private helper, and reserve_batch_cell re-created from its 1625 body with
-- only the free-cell check widened (same signature, grants and return type). Code already in
-- production never sends a 1K batch cell, so it behaves exactly as before.

create function public._batch_promo_allowed(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.org_members m join public.orgs o on o.id = m.org_id
     where m.user_id = p_user_id and m.status = 'active' and o.status = 'active' and o.affiliate_enabled
  );
$$;
revoke all on function public._batch_promo_allowed(uuid) from public, anon, authenticated, service_role;

create or replace function public.reserve_batch_cell(
  p_job_id uuid, p_user_id uuid, p_module text, p_template_id text,
  p_credits_cost integer, p_inputs jsonb, p_provider text, p_visibility text
) returns public.generation_jobs language plpgsql security definer set search_path = '' as $$
declare
  job public.generation_jobs;
  batch uuid := (p_inputs->>'batch_id')::uuid;
  position_in_batch integer := (p_inputs->>'batch_position')::integer;
begin
  job := public.reserve_credits(p_job_id,p_user_id,p_module,p_template_id,p_credits_cost,'web',
    p_inputs,p_provider,null,p_visibility,null);
  if job.inputs->>'attempt_id' is distinct from p_inputs->>'attempt_id' then return job; end if;
  -- The raise rolls back the reservation made above, so a refused free cell charges nothing.
  if job.credit_pool <> 'paid' and not public._batch_promo_allowed(p_user_id) then raise exception 'CREDITS_INSUFFICIENT'; end if;
  -- Legacy single-template batch clients do not have a preflight ID.
  if batch is null then return job; end if;
  if position_in_batch is null then raise exception 'INVALID_INPUT'; end if;
  if job.credits_cost is distinct from p_credits_cost then raise exception 'TEMPLATE_QUOTE_CHANGED'; end if;
  if (p_inputs->>'batch_templates')::integer > 1
     and (p_inputs->>'batch_templates')::integer > (public.effective_limits(p_user_id)->>'multi_template_max')::integer then
    raise exception 'BATCH_MAX_REQUIRED';
  end if;
  if exists (
    select 1 from public.generation_jobs j where j.user_id=p_user_id and j.batch_id=batch
      and j.status<>'failed' and (j.inputs->>'batch_position')::integer=position_in_batch and j.id<>p_job_id
  ) then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  update public.generation_jobs set batch_id=batch where id=p_job_id returning * into job;
  return job;
end;
$$;
revoke all on function public.reserve_batch_cell(uuid,uuid,text,text,integer,jsonb,text,text) from public, anon, authenticated;
grant execute on function public.reserve_batch_cell(uuid,uuid,text,text,integer,jsonb,text,text) to service_role;
