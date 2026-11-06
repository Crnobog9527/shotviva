-- T30: a second provider module, 'decision', for the photo-edit classifier (ARCHITECTURE §3.3,
-- §5.2). Its one adapter so far is 'openai_responses' (OpenAI Responses API, GPT-6 Luna); each
-- module keeps its own active row through the existing ai_providers_one_active_per_module index.

alter table public.ai_providers
  drop constraint ai_providers_module_check,
  add constraint ai_providers_module_check check (module in ('image', 'decision')),
  drop constraint ai_providers_adapter_check,
  add constraint ai_providers_adapter_check check (adapter in ('openai_images', 'openai_responses')),
  -- A module only runs its own adapters, so a row can never be switched on where it cannot work.
  add constraint ai_providers_module_adapter check (
    (module = 'image' and adapter = 'openai_images') or (module = 'decision' and adapter = 'openai_responses')
  );
