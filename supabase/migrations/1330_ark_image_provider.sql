-- Seedream through Volcano Engine Ark (火山方舟), the 'ark_images' image adapter (Owner 2026-11-13,
-- ARCHITECTURE §3.3). Only the allowed adapter values change. Every SQL function that branches on
-- the adapter already treats a third one as "full ratio options, no OpenAI list price, cost from
-- p95 or estimated_image_costs" (0920, 0929/1100, 0985/1252/1295, 1102), which is what Ark needs;
-- its 1k/2k tiers come from the capabilities the app saves, as for OpenRouter.
alter table public.ai_providers
  drop constraint ai_providers_adapter_check,
  add constraint ai_providers_adapter_check
    check (adapter in ('openai_images', 'openrouter_images', 'ark_images', 'openai_responses')),
  drop constraint ai_providers_module_adapter,
  add constraint ai_providers_module_adapter check (
    (module = 'image' and adapter in ('openai_images', 'openrouter_images', 'ark_images'))
    or (module = 'decision' and adapter = 'openai_responses')
  );
