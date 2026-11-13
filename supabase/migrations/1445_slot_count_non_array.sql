-- Fix for 1442: admin.slot_route_floor and admin.route_slot_costs counted a job's filled slots with
-- jsonb_array_length(inputs->'input_slots') next to a jsonb_typeof(...)='array' filter. SQL does not
-- evaluate AND in order, so a job whose input_slots is not an array (an earlier format kept on the
-- test site) raised "cannot get array length of a non-array" and failed the editor's pricing read
-- (template_sync_pricing_input → admin_image_pricing_catalog) and a slot template's reservation
-- check. Both now count through admin.slot_count, which is null for anything that is not an array
-- (such a job is not a full-slot sample). Same signatures, same results for well-formed rows.

create function admin.slot_count(p_inputs jsonb) returns integer
language sql immutable set search_path='' as $$
  select case when jsonb_typeof(p_inputs->'input_slots')='array' then jsonb_array_length(p_inputs->'input_slots') end
$$;
revoke all on function admin.slot_count(jsonb) from public,anon,authenticated;
grant execute on function admin.slot_count(jsonb) to service_role;

create or replace function admin.slot_route_floor(p_tag text, p_resolution text, p_quality text, p_slots integer, p_single integer)
returns integer language sql stable set search_path='' as $$
  with budget as (select admin.lowest_credit_price()*0.761*0.4 as usd),
  full_slots as (
    select percentile_cont(0.95) within group (order by g.cost_usd)::numeric as usd
      from public.generation_jobs g
      where g.provider=p_tag and g.inputs->>'resolution'=p_resolution
        and g.inputs ? 'quality' and g.inputs->>'quality'=p_quality
        and g.status='succeeded' and g.cost_usd is not null and g.created_at>=now()-interval '30 days'
        and admin.slot_count(g.inputs)=p_slots
      having count(*)>=10
  ), extra as (
    select p.extra_input_image_usd as usd from public.ai_providers p
      where p.module='image' and p.id::text=split_part(p_tag,'/',1) and p.id::text||'/'||p.model=p_tag
  )
  select case
    when p_single is null then null
    when coalesce(p_slots,0)<=1 then p_single
    when b.usd is null or b.usd<=0 then p_single*p_slots
    when (select usd from full_slots) is not null then greatest(p_single, ceil((select usd from full_slots)*1.10/b.usd)::int)
    when (select usd from extra) is not null then p_single+ceil((p_slots-1)*(select usd from extra)*1.10/b.usd)::int
    else p_single*p_slots end
  from budget b
$$;

create or replace function admin.route_slot_costs(p_tag text) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object(
    'extra_input_usd', (select p.extra_input_image_usd from public.ai_providers p
      where p.module='image' and p.id::text=split_part(p_tag,'/',1) and p.id::text||'/'||p.model=p_tag),
    'p95_full', coalesce((select jsonb_object_agg(quality,tiers) from (
      select quality, jsonb_object_agg(res,slots) tiers from (
        select quality, res, jsonb_object_agg(n::text,cost) slots from (
          select g.inputs->>'quality' quality, g.inputs->>'resolution' res, admin.slot_count(g.inputs) n,
            percentile_cont(0.95) within group (order by g.cost_usd) cost
          from public.generation_jobs g
          where g.provider=p_tag and g.inputs->>'quality' in ('medium','high') and g.inputs->>'resolution' in ('1k','2k','3k')
            and g.status='succeeded' and g.cost_usd is not null and g.created_at>=now()-interval '30 days'
            and admin.slot_count(g.inputs) between 2 and 4
          group by 1,2,3 having count(*)>=10
        ) per_n group by quality, res
      ) per_res group by quality
    ) per_quality),'{}'::jsonb))
$$;
