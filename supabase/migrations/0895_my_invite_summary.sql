-- The account owns one code, created on first visit. Return only signup time and paid status
-- for invitees; the paging cursor names a redemption, never a friend's profile or auth data.
create function public.my_invite_summary(p_user uuid, p_inviter_cap integer, p_cursor jsonb default null)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v_code text;
  v_result jsonb;
begin
  if p_inviter_cap is null or p_inviter_cap < 0 then raise exception 'INVALID_INPUT'; end if;
  v_code := public.get_or_create_invite_code(p_user);
  with invited as materialized (
    select r.id, r.user_id, r.created_at,
      exists(select 1 from public.payments p where p.user_id = r.user_id and p.created_at >= r.created_at) as purchased
    from public.code_redemptions r where r.inviter_user_id = p_user and r.status = 'ok'
  ),
  page as (
    select i.id, i.created_at, pr.created_at as registered_at, i.purchased
    from invited i join public.profiles pr on pr.id = i.user_id
    where p_cursor is null or (i.created_at,i.id) < ((p_cursor->>'created_at')::timestamptz,(p_cursor->>'id')::uuid)
    order by i.created_at desc, i.id desc limit 30
  ),
  rewards as (
    select coalesce(sum(l.delta),0) as earned,
      count(*) filter (where l.created_at > now() - interval '30 days') as used
    from public.credit_ledger l where l.user_id = p_user and l.kind = 'invite_reward'
  )
  select jsonb_build_object('code', v_code, 'invited', count(*),
    'purchasers', count(*) filter (where i.purchased), 'earned', (select earned from rewards),
    'rewards_left', greatest(0, p_inviter_cap - (select used from rewards)),
    'friends', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc, p.id desc) from page p), '[]'::jsonb))
  into v_result from invited i;
  return v_result;
end;
$$;
revoke all on function public.my_invite_summary(uuid,integer,jsonb) from public, anon, authenticated;
grant execute on function public.my_invite_summary(uuid,integer,jsonb) to service_role;
