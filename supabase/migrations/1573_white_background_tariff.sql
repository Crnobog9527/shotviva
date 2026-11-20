-- 1573: the white-background catalogue tariff follows the Owner's approved price (2026-11-16).
--
-- Only this template's row changes. The view is the approved-price record the sale checks read:
-- a save or sale at exactly the tariff on the exact route and quality captured in the price batch
-- skips the cost floor (assert_template_sale_floor, reservation_route_allowed), and
-- check_catalog_minimums refuses anything under it. So the floor rule itself stays as it is: a
-- different route, quality or a price below the tariff still meets the ordinary floor, and every
-- other template keeps its row exactly (edit as set in 1572).
-- Expand-only: same columns and types, three literals differ.
create or replace view admin.template_tariffs_v2 (id, quality, costs, style_sale_approved) as
select id, 'medium'::text, case
  when id = 'edit' then '{"1k":15,"2k":20,"4k":58}'::jsonb
  when id = 'white-background' then '{"1k":18,"2k":37,"4k":55}'::jsonb
  when id in ('promo-poster','pet-studio','freeform') then '{"1k":45,"2k":120,"4k":190}'::jsonb
  else '{"1k":74,"2k":150,"4k":225}'::jsonb end, false
from unnest(array['dark-dining','delivery-menu','white-background','lifestyle-table','spa-podium',
  'promo-poster','pet-studio','freeform','edit']) id;
