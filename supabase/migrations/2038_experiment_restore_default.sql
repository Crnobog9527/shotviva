-- "Restore default" for an ended experiment (ARCHITECTURE §16.5): an ended experiment keeps showing
-- its winner to everyone, and until now nothing but starting another experiment on that surface
-- stopped it. This retires it: experiments_live() no longer returns it, so the surface serves its
-- registry default again. The experiment, its variants, assignments and results stay readable.
-- Expand-only: one nullable column; the previous code never reads it, and the live list it gets is
-- the same shape. Running and paused experiments are untouched.

alter table public.experiments add column retired_at timestamptz;
-- Only admin_experiment_restore_default writes it, and only for an ended experiment (no check constraint: expand-only).

-- Per surface: the running or paused experiment, else the latest ended one unless it was retired.
-- Retiring the latest ended one does not bring back an older ended one (the pick is made first).
create or replace function public.experiments_live() returns jsonb
language sql stable security definer set search_path = '' as $$
  with live as (
    select e.* from public.experiments e where e.status in ('running', 'paused')
    union all
    select * from (
      select distinct on (e.surface) e.* from public.experiments e
      where e.status = 'ended'
        and not exists (select 1 from public.experiments l where l.surface = e.surface and l.status in ('running', 'paused'))
      order by e.surface, e.ended_at desc
    ) ended
    where ended.retired_at is null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id, 'surface', l.surface, 'status', l.status, 'winner', l.winner_variant_id,
    'variants', (
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'option', v.option_id, 'weight', v.weight, 'control', v.is_control,
        'archived', v.archived_at is not null, 'fallback', v.fallback_variant_id) order by v.id)
      from public.experiment_variants v where v.experiment_id = l.id)
  )), '[]'::jsonb)
  from live l
$$;

do $$
declare
  v_actions text[];
begin
  select array_agg(m[1] order by ord) into v_actions
    from pg_constraint c,
         regexp_matches(pg_get_constraintdef(c.oid), '''([a-z0-9_]+)''', 'g') with ordinality as t(m, ord)
   where c.conrelid = 'public.admin_audit_log'::regclass and c.conname = 'admin_audit_log_action_check';
  if v_actions is null or cardinality(v_actions) < 10 then
    raise exception 'admin_audit_log_action_check not found or unreadable';
  end if;
  if not 'experiment_restore_default' = any(v_actions) then v_actions := array_append(v_actions, 'experiment_restore_default'); end if;
  execute 'alter table public.admin_audit_log drop constraint admin_audit_log_action_check';
  execute 'alter table public.admin_audit_log add constraint admin_audit_log_action_check check (action in ('
    || (select string_agg(quote_literal(a), ',' order by o) from unnest(v_actions) with ordinality u(a, o)) || '))';
end;
$$;

-- Ended, not yet retired → retired. Anything else is EXPERIMENT_BAD_STATE (a double click or a
-- second admin finds it already done). Audit row in the same transaction.
create function public.admin_experiment_restore_default(p_actor uuid, p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_exp public.experiments;
begin
  perform admin.require_experiment_admin(p_actor);
  select * into v_exp from public.experiments where id = p_id for update;
  if not found then raise exception 'EXPERIMENT_NOT_FOUND'; end if;
  if v_exp.status <> 'ended' or v_exp.retired_at is not null then raise exception 'EXPERIMENT_BAD_STATE'; end if;
  update public.experiments set retired_at = now(), updated_at = now() where id = p_id;
  insert into public.admin_audit_log (action, user_id, reason, target_id)
  values ('experiment_restore_default', p_actor, format('%s: %s back to its default', v_exp.name, v_exp.surface), p_id::text);
end $$;
revoke all on function public.admin_experiment_restore_default(uuid, bigint) from public, anon, authenticated;
grant execute on function public.admin_experiment_restore_default(uuid, bigint) to service_role;
