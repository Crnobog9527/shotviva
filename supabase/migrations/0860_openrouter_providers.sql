-- T92: existing provider rows and callers that omit resolutions retain all three tiers.
alter table public.ai_providers
  drop constraint ai_providers_adapter_check,
  add constraint ai_providers_adapter_check check (adapter in ('openai_images', 'openrouter_images', 'openai_responses')),
  drop constraint ai_providers_module_adapter,
  add constraint ai_providers_module_adapter check (
    (module = 'image' and adapter in ('openai_images', 'openrouter_images'))
    or (module = 'decision' and adapter = 'openai_responses')
  ),
  add column resolutions text[] not null default '{1k,2k,3k}'
    check (cardinality(resolutions) > 0 and array_ndims(resolutions) = 1 and resolutions <@ array['1k','2k','3k']);
