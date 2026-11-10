-- Clients receive per-cell admission from the preflight. A failed job releases its slot
-- for a retry; a deleted success still consumes its slot.
alter table public.generation_jobs add column batch_id uuid;
create unique index generation_jobs_batch_slot on public.generation_jobs
  (user_id, batch_id, ((inputs->>'batch_position')::integer))
  where batch_id is not null and status <> 'failed';

create function admin.guard_generation_batch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.batch_id := (new.inputs->>'batch_id')::uuid;
  if new.batch_id is not null or (new.inputs->>'batch_size')::integer > 1 then
    if new.credit_pool <> 'paid' then raise exception 'CREDITS_INSUFFICIENT'; end if;
  end if;
  if new.batch_id is not null then
    if new.credits_cost is distinct from (new.inputs->>'batch_expected_credits')::integer then
      raise exception 'TEMPLATE_QUOTE_CHANGED';
    end if;
    if new.source <> 'web' or (new.inputs->>'batch_position')::integer is null then
      raise exception 'INVALID_INPUT';
    end if;
    if (new.inputs->>'batch_templates')::integer > 1 and public.current_tier(new.user_id) is distinct from 'max' then
      raise exception 'BATCH_MAX_REQUIRED';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function admin.guard_generation_batch() from public, anon, authenticated;
create trigger guard_generation_batch before insert on public.generation_jobs
  for each row execute function admin.guard_generation_batch();
