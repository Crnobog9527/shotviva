-- Site-wide generation lanes (queue-fairness plan Q3, ARCHITECTURE §6.6). Each image route belongs
-- to a lane (gpt: GPT image through OpenRouter or OpenAI; seedream: Volcengine Ark; other). Before a
-- request reserves credits it takes a slot in its lane, so no account, org or burst can use up a
-- provider's limit and turn everyone else's photos into failures:
--   - per lane: at most `inflight` slots live and `per_minute` slots taken in the last 60 s;
--   - batch photos may only use (100 - single_reserve_pct)% of either, so single photos and edits
--     always find room;
--   - one org (all its active members together) holds at most org_inflight_max live slots;
--   - all orgs together hold at most orgs_share_pct% of a lane's batch slots.
-- A refused request is RATE_LIMITED with nothing reserved; the browser queues it and resends
-- (Q1). Per-account limits (effective_limits concurrency / per_window) are unchanged and checked
-- before this. A slot is released when its job settles and otherwise lapses at expires_at, so a
-- function that died cannot hold one. The numbers live in system_settings.generation_lanes; only a
-- migration changes them for now (admin editing is Q6).
--
-- Also: sweep_stale_generation_jobs refunds jobs still 'running' long after any function that
-- could settle them has ended (v1 had no sweeper: their credits stayed reserved).
-- Expand-only: one new table, one new settings row, new functions, one new index.

insert into public.system_settings (key, value)
values ('generation_lanes', '{
  "lanes": {
    "gpt": {"per_minute": 120, "inflight": 100},
    "seedream": {"per_minute": 300, "inflight": 120},
    "other": {"per_minute": 120, "inflight": 20}
  },
  "single_reserve_pct": 20,
  "org_inflight_max": 24,
  "orgs_share_pct": 60,
  "slot_ttl_seconds": 360
}'::jsonb)
on conflict (key) do nothing;

-- One row per request that took a slot (attempt_id is the request's own id, so a replay of the
-- same job takes its own slot and releases it). Released rows stay a few minutes for the
-- per-minute count; the sweeper deletes them after that.
create table public.generation_slots (
  attempt_id uuid primary key,
  lane text not null check (lane in ('gpt', 'seedream', 'other')),
  user_id uuid not null references public.profiles (id) on delete cascade,
  org_id uuid references public.orgs (id) on delete set null,
  kind text not null check (kind in ('single', 'batch')),
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null,
  released_at timestamptz
);
create index generation_slots_lane_live on public.generation_slots (lane, expires_at) where released_at is null;
create index generation_slots_lane_acquired on public.generation_slots (lane, acquired_at);
create index generation_slots_org_live on public.generation_slots (org_id, expires_at) where released_at is null and org_id is not null;
alter table public.generation_slots enable row level security;
revoke all on table public.generation_slots from public, anon, authenticated;

-- One lane's two numbers, each falling back to its default when missing or out of range.
create function public._generation_lane(p jsonb, p_per_minute int, p_inflight int)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'per_minute', case when jsonb_typeof(p->'per_minute') = 'number' and (p->>'per_minute')::numeric between 1 and 10000
      then floor((p->>'per_minute')::numeric)::int else p_per_minute end,
    'inflight', case when jsonb_typeof(p->'inflight') = 'number' and (p->>'inflight')::numeric between 1 and 10000
      then floor((p->>'inflight')::numeric)::int else p_inflight end)
$$;

-- The settings with every number present and sane; a missing or broken row falls back to the
-- defaults above, never to "no limit" or "nothing allowed".
create function public.generation_lane_settings()
returns jsonb language sql stable security definer set search_path = '' as $$
  with raw as (
    select coalesce((select s.value from public.system_settings s where s.key = 'generation_lanes'), '{}'::jsonb) as v
  ), num as (
    select v,
      (case when jsonb_typeof(v->'single_reserve_pct') = 'number' then (v->>'single_reserve_pct')::numeric end) as reserve,
      (case when jsonb_typeof(v->'org_inflight_max') = 'number' then (v->>'org_inflight_max')::numeric end) as org_max,
      (case when jsonb_typeof(v->'orgs_share_pct') = 'number' then (v->>'orgs_share_pct')::numeric end) as share,
      (case when jsonb_typeof(v->'slot_ttl_seconds') = 'number' then (v->>'slot_ttl_seconds')::numeric end) as ttl
    from raw
  )
  select jsonb_build_object(
    'single_reserve_pct', case when reserve between 0 and 90 then floor(reserve)::int else 20 end,
    'org_inflight_max', case when org_max between 1 and 1000 then floor(org_max)::int else 24 end,
    'orgs_share_pct', case when share between 1 and 100 then floor(share)::int else 60 end,
    'slot_ttl_seconds', case when ttl between 60 and 1800 then floor(ttl)::int else 360 end,
    'lanes', jsonb_build_object(
      'gpt', public._generation_lane(v->'lanes'->'gpt', 120, 100),
      'seedream', public._generation_lane(v->'lanes'->'seedream', 300, 120),
      'other', public._generation_lane(v->'lanes'->'other', 120, 20)))
  from num
$$;



-- { granted, reason? }. Serialised per lane, and per org for org members (advisory locks), so two requests cannot
-- both take the last slot. A repeat with the same attempt_id is granted without a second slot.
create function public.acquire_generation_slot(p_attempt_id uuid, p_lane text, p_user_id uuid, p_kind text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  cfg jsonb := public.generation_lane_settings();
  lane jsonb;
  reserve int := (cfg->>'single_reserve_pct')::int;
  cap int;
  per_minute int;
  v_org uuid;
  live int;
  recent int;
  org_live int;
  orgs_live int;
  reason text;
begin
  if p_lane not in ('gpt', 'seedream', 'other') or p_kind not in ('single', 'batch') then
    raise exception 'INVALID_INPUT';
  end if;
  lane := cfg->'lanes'->p_lane;
  cap := (lane->>'inflight')::int;
  per_minute := (lane->>'per_minute')::int;
  if p_kind = 'batch' then
    cap := greatest(1, floor(cap * (100 - reserve) / 100.0)::int);
    per_minute := greatest(1, floor(per_minute * (100 - reserve) / 100.0)::int);
  end if;

  perform pg_advisory_xact_lock(hashtext('generation_lane:' || p_lane));
  if exists (select 1 from public.generation_slots s where s.attempt_id = p_attempt_id) then
    return jsonb_build_object('granted', true);
  end if;

  select o.id into v_org
    from public.org_members m join public.orgs o on o.id = m.org_id
   where m.user_id = p_user_id and m.status = 'active' and o.status = 'active';
  -- The org cap spans lanes, so two of one org's requests in different lanes must not both pass
  -- it: a second lock per org, always taken after the lane lock (one lane lock, then at most one
  -- org lock, in that order: no cycle, no deadlock).
  if v_org is not null then
    perform pg_advisory_xact_lock(hashtext('generation_org:' || v_org::text));
  end if;

  select count(*) filter (where s.released_at is null and s.expires_at > now()),
         count(*) filter (where s.acquired_at > now() - interval '60 seconds'),
         count(*) filter (where s.released_at is null and s.expires_at > now() and s.org_id is not null)
    into live, recent, orgs_live
    from public.generation_slots s
   where s.lane = p_lane and (s.acquired_at > now() - interval '60 seconds' or (s.released_at is null and s.expires_at > now()));

  if live >= cap then reason := 'lane_full';
  elsif recent >= per_minute then reason := 'lane_rate';
  end if;

  if reason is null and v_org is not null then
    -- The org cap spans every lane: it is the org's share of the site, not of one provider.
    select count(*) into org_live from public.generation_slots s
     where s.org_id = v_org and s.released_at is null and s.expires_at > now();
    if org_live >= (cfg->>'org_inflight_max')::int then reason := 'org_full';
    elsif p_kind = 'batch' and orgs_live >= greatest(1, floor(cap * (cfg->>'orgs_share_pct')::int / 100.0)::int) then
      reason := 'orgs_share';
    end if;
  end if;

  if reason is not null then
    return jsonb_build_object('granted', false, 'reason', reason);
  end if;

  insert into public.generation_slots (attempt_id, lane, user_id, org_id, kind, expires_at)
  values (p_attempt_id, p_lane, p_user_id, v_org, p_kind, now() + make_interval(secs => (cfg->>'slot_ttl_seconds')::int));
  return jsonb_build_object('granted', true);
end;
$$;

create function public.release_generation_slot(p_attempt_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.generation_slots set released_at = now() where attempt_id = p_attempt_id and released_at is null;
$$;

-- The every-minute sweep (/api/cron/generation-sweep): jobs still 'running' p_older_than after
-- they were created, when no function can still be settling them, are failed and refunded through
-- refund_job (which refunds at most once: a failed job is returned as it is). Also drops slot rows
-- nobody counts any more. Returns how many jobs it refunded.
create index generation_jobs_running_created on public.generation_jobs (created_at) where status = 'running';

create function public.sweep_stale_generation_jobs(p_older_than interval, p_limit integer default 50)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  refunded integer := 0;
begin
  if p_older_than < interval '10 minutes' then raise exception 'INVALID_INPUT'; end if;
  for v_id in
    select j.id from public.generation_jobs j
     where j.status = 'running' and j.created_at < now() - p_older_than
     order by j.created_at
     limit least(greatest(p_limit, 1), 200)
  loop
    begin
      perform public.refund_job(v_id, 'STALE_TIMEOUT', null, null);
      refunded := refunded + 1;
    exception when others then
      -- Settled meanwhile (JOB_ALREADY_SETTLED) or any other refusal: leave it for the next pass.
      null;
    end;
  end loop;
  delete from public.generation_slots s
   where s.acquired_at < now() - interval '10 minutes' and (s.released_at is not null or s.expires_at < now());
  return refunded;
end;
$$;

revoke all on function public.generation_lane_settings(), public._generation_lane(jsonb, int, int),
  public.acquire_generation_slot(uuid, text, uuid, text), public.release_generation_slot(uuid),
  public.sweep_stale_generation_jobs(interval, integer)
  from public, anon, authenticated;
grant execute on function public.generation_lane_settings(), public._generation_lane(jsonb, int, int),
  public.acquire_generation_slot(uuid, text, uuid, text), public.release_generation_slot(uuid),
  public.sweep_stale_generation_jobs(interval, integer)
  to service_role;
