-- T30: the built-in template `edit` that every photo edit runs on (ARCHITECTURE §5.2). Same
-- default price as a standard template (2 / 4 / 6, Owner 2026-11-06; editable in admin, never
-- below the floor). It starts unpublished: editing stays off until the Owner has written the
-- real texts in /admin/templates/edit and switched it on.
--
-- The wrapper, the five decision questions and the six constraint paragraphs are core prompts
-- and never enter git (AGENTS §5): what is seeded here is placeholders only, in the shape the
-- code reads (core/templates/edit-params.ts). `on conflict do nothing` so a re-run never
-- overwrites what the Owner wrote.

insert into public.templates (id, module, name, category, fields, quality, credits_cost, sort_order, is_active, visible_in)
values (
  'edit', 'image', 'Edit', 'edit',
  '{"images": {"min": 1, "max": 1}, "copy": [], "aspectRatios": ["1:1"]}'::jsonb,
  'high', '{"1k": 2, "2k": 4, "3k": 6}'::jsonb, 0, false, '{}'
)
on conflict (id) do nothing;

insert into public.template_prompts (template_id, body, model_params)
values (
  'edit',
  'PLACEHOLDER: set the edit wrapper in /admin/templates/edit.',
  jsonb_build_object(
    'input_fidelity', 'high',
    'questions', jsonb_build_object(
      'object', 'PLACEHOLDER: set in /admin/templates/edit.',
      'background', 'PLACEHOLDER: set in /admin/templates/edit.',
      'style', 'PLACEHOLDER: set in /admin/templates/edit.',
      'subject', 'PLACEHOLDER: set in /admin/templates/edit.',
      'overall', 'PLACEHOLDER: set in /admin/templates/edit.'
    ),
    'constraints', jsonb_build_object(
      'object', '', 'background', '', 'style', '', 'subject', '', 'overall', '', 'fallback', ''
    )
  )
)
on conflict (template_id) do nothing;
