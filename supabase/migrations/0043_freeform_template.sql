-- Built-in freeform template (ARCHITECTURE §5): free-text generation shares the template code
-- path. Partner-only, because Shotviva's own UI never shows a prompt box (DESIGN).
-- The pass-through body is not a crafted prompt, so it is safe to keep in git.

insert into public.templates (id, module, name, category, fields, credits_cost, sort_order, is_active, visible_in)
values (
  'freeform',
  'image',
  'Freeform',
  'freeform',
  '{
    "images": { "min": 0, "max": 1 },
    "copy": [{ "key": "prompt", "label": "Prompt", "required": true, "maxLength": 2000 }],
    "aspectRatios": ["1:1", "4:5", "3:4", "9:16", "16:9"]
  }'::jsonb,
  1,
  0,
  true,
  array['partner']::text[]
);

insert into public.template_prompts (template_id, body)
values ('freeform', '{{prompt}}');
