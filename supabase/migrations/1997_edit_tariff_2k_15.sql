-- 作品编辑 (the `edit` template) tariff and floor (Owner 2026-11-23).
--
-- Only 2K is sold for edits, at 15 credits (bound to Seedream 5.5). admin.template_tariffs_v2 is the
-- sale minimum check_catalog_minimums enforces, and its edit row still said 2K 20, so 15 could
-- not be saved. The view is re-created from 1573 verbatim with only that literal changed.
--
-- The tariff also counts as an approved price on the GPT route the price batch recorded
-- (template_approved_price(s), 1552): a save or reserve at exactly the tariff there skips the
-- route's cost floor. For edit that would let 2K at 15 through on GPT, under its ~20 floor, if the
-- edit were ever bound to GPT again. Edit is therefore left out of both approval functions (re-
-- created from 1552 with only that condition added), so every route's own floor applies to it;
-- every other template keeps its approval exactly.
-- Expand-only: same columns, signatures and return types.

create or replace view admin.template_tariffs_v2 (id, quality, costs, style_sale_approved) as
select id, 'medium'::text, case
  when id = 'edit' then '{"1k":15,"2k":15,"4k":58}'::jsonb
  when id = 'white-background' then '{"1k":18,"2k":37,"4k":55}'::jsonb
  when id in ('promo-poster','pet-studio','freeform') then '{"1k":45,"2k":120,"4k":190}'::jsonb
  else '{"1k":74,"2k":150,"4k":225}'::jsonb end, false
from unnest(array['dark-dining','delivery-menu','white-background','lifestyle-table','spa-podium',
  'promo-poster','pet-studio','freeform','edit']) id;

create or replace function admin.template_approved_price(p_provider uuid, p_template text) returns jsonb
  language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('quality',c.quality,'costs',c.costs)
  from admin.template_price_batches b join admin.template_price_snapshots s on s.batch_id=b.id
  join admin.template_tariffs_v2 c on c.id=s.template_id
  join public.ai_providers sp on sp.id=s.provider_id
  join public.ai_providers p on p.id=p_provider
  where b.reverted_at is null and admin.is_template_catalog_v2() and s.template_id=p_template and s.template_id<>'edit'
    and sp.module='image' and sp.adapter='openai_images' and sp.model='gpt-image-2.6-sunburst'
    and md5(sp.base_url) is not distinct from s.provider_endpoint_hash
    and (sp.capabilities->'resolutions') ?& array['1k','2k','4k']
    and p.module='image' and (p.id=sp.id or (p.adapter='openrouter_images' and admin.provider_cost_model(p)=sp.model))
    and (p.capabilities->'resolutions') ?& array['1k','2k','4k']
  limit 1
$$;

create or replace function admin.template_approved_prices(p_provider uuid) returns jsonb
  language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_object_agg(s.template_id,jsonb_build_object('quality',c.quality,'costs',c.costs)), '{}')
  from admin.template_price_batches b join admin.template_price_snapshots s on s.batch_id=b.id
  join admin.template_tariffs_v2 c on c.id=s.template_id
  join public.ai_providers sp on sp.id=s.provider_id
  join public.ai_providers p on p.id=p_provider
  where b.reverted_at is null and admin.is_template_catalog_v2() and s.template_id<>'edit'
    and sp.module='image' and sp.adapter='openai_images' and sp.model='gpt-image-2.6-sunburst'
    and md5(sp.base_url) is not distinct from s.provider_endpoint_hash
    and (sp.capabilities->'resolutions') ?& array['1k','2k','4k']
    and p.module='image' and (p.id=sp.id or (p.adapter='openrouter_images' and admin.provider_cost_model(p)=sp.model))
    and (p.capabilities->'resolutions') ?& array['1k','2k','4k']
$$;
