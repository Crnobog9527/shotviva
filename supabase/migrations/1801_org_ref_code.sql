-- Enterprise number for bank-transfer references (ARCHITECTURE §6.5): orgs.ref_code, 'SV-' + 6
-- characters from an alphabet without 0, 1, I, L, O. Generated on the server when an org row is
-- inserted (so admin_org_create and any other insert need no change), never changes afterwards.
-- Not a secret, but only the org's owner and platform admins read it (orgs has no client grant).
--
-- Expand-only: a nullable column is added, every existing org is backfilled, then the unique
-- index and format check; the code running before this migration never mentions the column.

alter table public.orgs add column ref_code text;

-- 31 characters: 2-9, A-H, J, K, M, N, P-Z. Collisions are retried; a race between two inserts
-- picking the same free code is caught by the unique index (an insert error, practically never).
create function public._org_ref_code_new() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  bytes bytea;
  code text;
  i int;
begin
  loop
    bytes := uuid_send(gen_random_uuid());
    code := 'SV-';
    for i in 0..5 loop
      code := code || substr(alphabet, 1 + (get_byte(bytes, i) % 31), 1);
    end loop;
    exit when not exists(select from public.orgs where ref_code = code);
  end loop;
  return code;
end;
$$;
revoke all on function public._org_ref_code_new() from public, anon, authenticated, service_role;

-- Backfill (one row at a time so each pick sees the codes already given).
do $$
declare r record;
begin
  for r in select id from public.orgs where ref_code is null loop
    update public.orgs set ref_code = public._org_ref_code_new() where id = r.id;
  end loop;
end $$;

alter table public.orgs
  add constraint orgs_ref_code_format check (ref_code ~ '^SV-[2-9A-HJKMNP-Z]{6}$');
create unique index orgs_ref_code_key on public.orgs (ref_code);

-- Fill on insert; refuse any later change (the number is printed on bank slips).
create function public._orgs_ref_code_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.ref_code is null then new.ref_code := public._org_ref_code_new(); end if;
  elsif new.ref_code is distinct from old.ref_code then
    raise exception 'ORG_REF_CODE_IMMUTABLE';
  end if;
  return new;
end;
$$;
revoke all on function public._orgs_ref_code_guard() from public, anon, authenticated, service_role;
create trigger orgs_ref_code_guard before insert or update on public.orgs
  for each row execute function public._orgs_ref_code_guard();
