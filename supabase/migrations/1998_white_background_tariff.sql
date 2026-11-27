-- 电商白底图 (`white-background`) tariff 18/37/55 → 20/20/35 (Owner 2026-11-23, approved below the
-- route's cost floor on purpose: under the tier rule 1K is free-pool only, so paid users pay 2K).
-- admin.template_tariffs_v2 is re-created from 1997 verbatim with only that literal changed; the
-- tariff remains the approved price on the GPT route (template_approved_price(s), unchanged), so
-- saving exactly 20/20/35 passes while any other price below the floor is still refused.
-- Expand-only: same columns.

create or replace view admin.template_tariffs_v2 (id, quality, costs, style_sale_approved) as
select id, 'medium'::text, case
  when id = 'edit' then '{"1k":15,"2k":15,"4k":58}'::jsonb
  when id = 'white-background' then '{"1k":20,"2k":20,"4k":35}'::jsonb
  when id in ('promo-poster','pet-studio','freeform') then '{"1k":45,"2k":120,"4k":190}'::jsonb
  else '{"1k":74,"2k":150,"4k":225}'::jsonb end, false
from unnest(array['dark-dining','delivery-menu','white-background','lifestyle-table','spa-podium',
  'promo-poster','pet-studio','freeform','edit']) id;
