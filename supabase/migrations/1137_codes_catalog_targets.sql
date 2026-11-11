-- T105 phase 2 (ARCHITECTURE §6): a campaign may target any published catalog SKU, not only the
-- nine original ids. Widening only (every existing row still passes): the check keeps the shape
-- of a product id; admin_save_code (_validate_code_discount, 1127) and the catalog_validate_discount
-- trigger check the SKU against the published catalog and its cost floor.
alter table public.codes
  drop constraint codes_discount_products_check,
  add constraint codes_discount_products_check check (discount_products is null or (
    cardinality(discount_products) > 0 and array_position(discount_products, null) is null
    and array_to_string(discount_products, ' ') ~ '^[a-z][a-z0-9_]{0,63}( [a-z][a-z0-9_]{0,63})*$'));
