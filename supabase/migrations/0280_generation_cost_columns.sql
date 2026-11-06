-- T33: real generation cost (ARCHITECTURE §3.3, §4, §10.0).
--
-- generation_jobs keeps what the provider reported using and the cost worked out at settle time
-- from the active provider's prices then; a later price change leaves history alone. Both stay
-- null when the provider reported nothing or a price was missing (the admin says "无法计算").
-- Jobs settled before T33 have no usage either; the admin estimates those (labelled 「估算」).
--
-- ai_providers gets the three per-million-token prices the Owner copies from the provider's
-- price page. Null means "not filled in" and the admin flags the row.

alter table public.generation_jobs
  add column provider_usage jsonb,
  add column cost_usd numeric(10, 6),
  add constraint generation_jobs_provider_usage_object check (provider_usage is null or jsonb_typeof(provider_usage) = 'object'),
  add constraint generation_jobs_cost_usd_nonnegative check (cost_usd is null or cost_usd >= 0);

alter table public.ai_providers
  add column price_input_text_per_m numeric(12, 6),
  add column price_input_image_per_m numeric(12, 6),
  add column price_output_per_m numeric(12, 6),
  add constraint ai_providers_prices_nonnegative check (
    coalesce(price_input_text_per_m, 0) >= 0
    and coalesce(price_input_image_per_m, 0) >= 0
    and coalesce(price_output_per_m, 0) >= 0
  );
