-- 1566: model prices come from a live source or from the admin, never from a table in code
-- (Owner 2026-11-15). Two nullable columns on ai_providers; expand-only, older code never reads them.
--
-- catalog_price: the last price read from OpenRouter's public model catalogue for this line's
--   model (text lines and official OpenAI image lines), with the catalogue id, source URL and
--   fetchedAt. Written by the server (save and the daily capability cron), never by a client.
-- list_price: a price the admin typed in from the provider's own price page, with that page's URL
--   and the date it was checked. Only Volcano Engine Ark (per-image yuan) uses it today: Ark's
--   price API (ListModelChargeItems) needs an account AK/SK the site does not hold.

alter table public.ai_providers
  add column catalog_price jsonb check (catalog_price is null or jsonb_typeof(catalog_price) = 'object'),
  add column list_price jsonb check (list_price is null or jsonb_typeof(list_price) = 'object');

-- The admin's list price for one Ark line: bands of yuan per output image by pixel count, yuan per
-- input image, the price page and the date read. null clears it (the line's jobs then have no cost).
create function public.admin_set_provider_list_price(p_actor uuid, p_id uuid, p_price jsonb) returns void
  language plpgsql set search_path to '' as $$
begin
  if not exists(select from public.profiles where id=p_actor and role='admin' and banned_at is null) then raise exception 'NOT_ADMIN'; end if;
  if p_price is not null and (jsonb_typeof(p_price) <> 'object'
     or jsonb_typeof(p_price->'outputBands') <> 'array' or jsonb_array_length(p_price->'outputBands') not between 1 and 5
     or exists(select from jsonb_array_elements(p_price->'outputBands') b
               where jsonb_typeof(b) <> 'object' or jsonb_typeof(b->'cny') <> 'number' or (b->>'cny')::numeric < 0
                  or coalesce(jsonb_typeof(b->'maxPixels'), 'null') not in ('null', 'number')
                  or (jsonb_typeof(b->'maxPixels') = 'number' and (b->>'maxPixels')::numeric <= 0))
     or jsonb_typeof(p_price->'inputImageCny') <> 'number' or (p_price->>'inputImageCny')::numeric < 0
     or coalesce(p_price->>'source', '') !~ '^https://'
     or coalesce(p_price->>'asOf', '') !~ '^\d{4}-\d{2}-\d{2}$') then
    raise exception 'INVALID_INPUT';
  end if;
  update public.ai_providers set list_price=p_price where id=p_id and adapter='ark_images';
  if not found then raise exception 'PROVIDER_NOT_FOUND'; end if;
end $$;

revoke all on function public.admin_set_provider_list_price(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.admin_set_provider_list_price(uuid,uuid,jsonb) to service_role;
