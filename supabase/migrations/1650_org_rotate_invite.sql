-- The org owner resets the invite link used to join the org (ARCHITECTURE §6.5, card E4). Until
-- now only an admin could rotate orgs.invite_token (admin_org_update); the account centre's
-- 「企业」 block lets the owner do it too. Same locking as every owner function (1627): the org
-- row FOR NO KEY UPDATE, never changing orgs.id. A suspended org may still reset its link.
-- Members already in keep their seats; only the old link stops working. Returns the new token.
create or replace function public.org_rotate_invite(p_owner uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  o public.orgs;
  token text := replace(gen_random_uuid()::text, '-', '');
begin
  o := public._org_lock_owned(p_owner, true);
  update public.orgs set invite_token = token, updated_at = now() where id = o.id;
  return token;
end;
$$;
revoke all on function public.org_rotate_invite(uuid) from public, anon, authenticated, service_role;
grant execute on function public.org_rotate_invite(uuid) to service_role;
