-- Dense-text posters, free redraw (Owner 2026-11-13): when the automatic check (1346) found a line
-- on a poster that differs from what the user confirmed, the first redraw of that poster is free;
-- later ones charge like any job. "Free" is a refund on success: the redraw reserves and runs like
-- any job (so reserve_credits and its price checks are untouched), and once it has succeeded the
-- server calls grant_poster_free_redraw, which gives back exactly what that job reserved, to the
-- pool it came from. One per poster (set + part): the primary key below makes a second grant for
-- the same poster impossible, and the ledger key makes a replay of the same job a no-op. A redraw
-- that fails is refunded as usual and leaves the free redraw unused.
create table public.poster_free_redraws (
  set_id uuid not null references public.poster_sets (id) on delete cascade,
  part integer not null check (part >= 0),
  job_id uuid not null unique references public.generation_jobs (id) on delete cascade,
  source_job_id uuid not null references public.generation_jobs (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (set_id, part)
);

alter table public.poster_free_redraws enable row level security;
revoke all on public.poster_free_redraws from anon, authenticated;
grant select, insert on public.poster_free_redraws to service_role;

-- True when this call (or an earlier call for the same job) made the job free. The redraw names
-- its source in inputs.poster.redraw_of; the source must be the same user's poster job for the
-- same set, part and template, whose check found a mismatch.
create function public.grant_poster_free_redraw(p_job_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_job public.generation_jobs;
  v_source public.generation_jobs;
  v_set uuid;
  v_part integer;
  v_claimed uuid;
begin
  select * into v_job from public.generation_jobs where id = p_job_id;
  if not found or v_job.status <> 'succeeded' or v_job.inputs->'poster'->>'redraw_of' is null then
    return false;
  end if;
  select * into v_source from public.generation_jobs
   where id = (v_job.inputs->'poster'->>'redraw_of')::uuid and user_id = v_job.user_id and status = 'succeeded';
  if not found or v_source.template_id <> v_job.template_id
     or v_source.inputs->'poster'->'set_id' is distinct from v_job.inputs->'poster'->'set_id'
     or v_source.inputs->'poster'->'part' is distinct from v_job.inputs->'poster'->'part' then
    return false;
  end if;
  if not exists (select from public.poster_checks where job_id = v_source.id and status = 'mismatch') then
    return false;
  end if;
  v_set := (v_job.inputs->'poster'->>'set_id')::uuid;
  v_part := (v_job.inputs->'poster'->>'part')::integer;
  insert into public.poster_free_redraws (set_id, part, job_id, source_job_id)
  values (v_set, v_part, v_job.id, v_source.id)
  on conflict (set_id, part) do nothing
  returning job_id into v_claimed;
  if v_claimed is null then
    return exists (select from public.poster_free_redraws where set_id = v_set and part = v_part and job_id = v_job.id);
  end if;
  perform public._apply_credit_change(
    v_job.user_id, v_job.credit_pool, 'refund', v_job.credits_cost, 'poster free redraw',
    'job:' || v_job.id::text || ':poster_free_redraw', v_job.id
  );
  return true;
end;
$$;

revoke all on function public.grant_poster_free_redraw(uuid) from public, anon, authenticated;
grant execute on function public.grant_poster_free_redraw(uuid) to service_role;
