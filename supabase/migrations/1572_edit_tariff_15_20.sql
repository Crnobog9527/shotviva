-- 1572: the edit (作品编辑) catalogue tariff follows the Owner's approved price, 1K 15 / 2K 20.
--
-- admin.template_catalog_minimums() hands out admin.template_tariffs_v2 as the sale minimum of every
-- template in an un-reverted price batch, and check_catalog_minimums() refuses a save below it.
-- The view still carried the cutover numbers for edit (1K 20 / 2K 37), so the admin refused the
-- approved price. Only the edit row changes: 4K stays at its tariff (the edit's 4K sale price is
-- decided elsewhere and is not touched here), and every other template keeps its row exactly.
-- Readers (check_catalog_minimums, template_catalog_minimums, template_approved_price(s),
-- reservation_route_allowed, the cutover snapshot) read costs through the view, so none needs a
-- change. The route floor itself (fallback_route_floor, slot_floor_credits) is a separate check
-- and still applies on top of the tariff.
-- Expand-only: same columns and types, one literal differs.
create or replace view admin.template_tariffs_v2 (id, quality, costs, style_sale_approved) as
select id, 'medium'::text, case
  when id = 'edit' then '{"1k":15,"2k":20,"4k":58}'::jsonb
  when id in ('promo-poster','pet-studio','freeform') then '{"1k":45,"2k":120,"4k":190}'::jsonb
  else '{"1k":74,"2k":150,"4k":225}'::jsonb end, false
from unnest(array['dark-dining','delivery-menu','white-background','lifestyle-table','spa-podium',
  'promo-poster','pet-studio','freeform','edit']) id;
