-- The food templates' dish reading (ARCHITECTURE §5.1c) gets its own provider module, so it can use
-- a stronger vision model (Owner 2026-11-15: gpt-6-sol) while the judge keeps its cheaper one.
-- Without an active 'dish_read' row the reading uses the 'decision' row, as before. Both checks
-- only widen: every existing row still passes, and code that never names 'dish_read' is unaffected.
alter table public.ai_providers
  drop constraint ai_providers_module_check,
  add constraint ai_providers_module_check check (module in ('image', 'decision', 'dish_read'));

alter table public.ai_providers
  drop constraint ai_providers_module_adapter,
  add constraint ai_providers_module_adapter check (
    (module = 'image' and adapter in ('openai_images', 'openrouter_images', 'ark_images'))
    or (module in ('decision', 'dish_read') and adapter = 'openai_responses')
  );
