-- Immutable per-template object paths. An unchanged key always denotes the same WebP.
create or replace function admin.valid_style_refs(p_template_id text, p_refs jsonb)
returns boolean language plpgsql immutable strict set search_path = '' as $$
declare
  ref jsonb;
  seen text[] := '{}';
  ref_key text;
begin
  if jsonb_typeof(p_refs) <> 'array' then return false; end if;
  if jsonb_array_length(p_refs) > 3 then return false; end if;
  for ref in select value from jsonb_array_elements(p_refs) loop
    if jsonb_typeof(ref) <> 'object' then return false; end if;
    if not ref ?& array['key','width','height','uploadedAt']
      or ref - array['key','width','height','uploadedAt'] <> '{}'
      or jsonb_typeof(ref->'key') <> 'string' or jsonb_typeof(ref->'uploadedAt') <> 'string'
      or jsonb_typeof(ref->'width') <> 'number' or jsonb_typeof(ref->'height') <> 'number' then
      return false;
    end if;
    ref_key := ref->>'key';
    if split_part(ref_key, '/', 2) <> p_template_id
      or ref_key !~ '^style-refs/[a-z0-9-]+/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
      or ref_key = any(seen)
      or ref->>'width' !~ '^[1-9][0-9]{0,3}$' or ref->>'height' !~ '^[1-9][0-9]{0,3}$'
      or (ref->>'width')::numeric > 1536 or (ref->>'height')::numeric > 1536
      or ref->>'uploadedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z$'
      or not pg_input_is_valid(ref->>'uploadedAt','timestamptz') then return false;
    end if;
    seen := array_append(seen, ref_key);
  end loop;
  return true;
end;
$$;
revoke all on function admin.valid_style_refs(text,jsonb) from public,anon,authenticated;
grant execute on function admin.valid_style_refs(text,jsonb) to service_role;

alter table public.template_prompts add column style_refs jsonb not null default '[]';

-- The wrapper scopes the requested references to its own invocation. Apply them in the
-- same INSERT/UPDATE as the body, so one save produces exactly one revision. Run after
-- the legacy/T93 bump trigger and keep its explicit sync revision when refs are unchanged.
create or replace function admin.apply_style_refs() returns trigger
language plpgsql set search_path = '' as $$
declare
  pending jsonb := nullif(current_setting('shotviva.save_style_refs',true),'')::jsonb;
begin
  if pending->>'id' = new.template_id then new.style_refs := pending->'refs'; end if;
  if new.style_refs <> '[]' and not admin.valid_style_refs(new.template_id,new.style_refs) then
    raise exception 'INVALID_STYLE_REFS' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and old.style_refs is distinct from new.style_refs then
    new.version := old.version + 1;
    new.updated_at := now();
  end if;
  return new;
end;
$$;
revoke all on function admin.apply_style_refs() from public,anon,authenticated;
create trigger template_prompts_style_refs before insert or update on public.template_prompts
  for each row execute function admin.apply_style_refs();
