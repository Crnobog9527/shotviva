-- T30: a built-in template is on no surface (ARCHITECTURE §5.2): the photo-edit template `edit`
-- has an empty visible_in, so no catalogue, generate route or partner listing ever offers it
-- (they all filter with visible_in @> {surface}). The allowed values are unchanged.

alter table public.templates
  drop constraint templates_visible_in_check,
  add constraint templates_visible_in_check check (visible_in <@ array['web', 'partner']);
