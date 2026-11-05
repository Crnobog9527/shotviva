-- T16: a template's price is its quality tier × the resolution the user picks (ARCHITECTURE §5,
-- §6.1). templates.credits_cost goes from one integer to one positive integer per resolution
-- ('1k' / '2k' / '3k', all three required), and templates.quality is the `quality` sent to the
-- image model. The admin page keeps every number at or above the floor table in modules/image.

alter table public.templates
  add column quality text not null default 'high' check (quality in ('high', 'medium'));

-- Existing rows become 'high' templates priced at the high defaults (2 / 4 / 6), or at their
-- old per-image price scaled by resolution when that was higher, so no price goes down.
alter table public.templates drop constraint templates_credits_cost_check;
alter table public.templates alter column credits_cost drop default;
alter table public.templates
  alter column credits_cost type jsonb using jsonb_build_object(
    '1k', greatest(credits_cost, 2),
    '2k', greatest(credits_cost * 2, 4),
    '3k', greatest(credits_cost * 3, 6)
  );
alter table public.templates
  alter column credits_cost set default '{"1k": 2, "2k": 4, "3k": 6}'::jsonb;

-- Exactly the three resolution keys, each a JSON number that is a positive integer below 1000.
-- ?& makes a missing key false rather than NULL (a NULL check passes); removing the three keys
-- must leave an empty object, so a stray key ('4k') is rejected too.
alter table public.templates
  add constraint templates_credits_cost_check check (
    jsonb_typeof(credits_cost) = 'object'
    and credits_cost ?& array['1k', '2k', '3k']
    and credits_cost - '1k' - '2k' - '3k' = '{}'::jsonb
    and jsonb_typeof(credits_cost -> '1k') = 'number' and (credits_cost ->> '1k') ~ '^[1-9][0-9]{0,2}$'
    and jsonb_typeof(credits_cost -> '2k') = 'number' and (credits_cost ->> '2k') ~ '^[1-9][0-9]{0,2}$'
    and jsonb_typeof(credits_cost -> '3k') = 'number' and (credits_cost ->> '3k') ~ '^[1-9][0-9]{0,2}$'
  );

-- freeform is priced like a high template at every resolution (ARCHITECTURE §5).
update public.templates
   set quality = 'high', credits_cost = '{"1k": 2, "2k": 4, "3k": 6}'::jsonb
 where id = 'freeform';
